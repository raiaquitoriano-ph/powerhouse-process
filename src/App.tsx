import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FormEvent } from 'react'
import './App.css'
import {
  createSheetsItem,
  deleteSheetsItem,
  isSheetsConfigured,
  listSheetsItems,
  updateSheetsItem,
  type SheetsItem,
} from './sheetsApi'

type Step =
  | 'Customer Acquisition'
  | 'Bill Collection'
  | 'Bill Extraction'
  | 'Contracting'
  | 'Invoicing'
  | 'Payments'
type Segment = 'B2B' | 'B2C'
type Status =
  | 'For Validation'
  | 'Validated'
  | 'For Automation'
  | 'Automated'
  | 'Invalidated'

type ProcessItem = {
  id: string
  title: string
  description: string
  step: Step
  segment: Segment
  status: Status
}

type NewItemForm = {
  title: string
  description: string
  step: Step
  segment: Segment
}

type EditItemForm = NewItemForm & { id: string; status: Status }

const STEPS: Step[] = [
  'Customer Acquisition',
  'Bill Collection',
  'Contracting',
  'Bill Extraction',
  'Invoicing',
  'Payments',
]
const STATUS_STATES: Status[] = [
  'For Validation',
  'Validated',
  'For Automation',
  'Automated',
  'Invalidated',
]
const SEGMENTS: Segment[] = ['B2B', 'B2C']

const newItemDefaults: NewItemForm = {
  title: '',
  description: '',
  step: 'Customer Acquisition',
  segment: 'B2C',
}

const ALLOWED_STATUS_TRANSITIONS: Record<Status, Status[]> = {
  'For Validation': ['Validated', 'Invalidated'],
  Validated: ['For Automation'],
  'For Automation': ['Automated', 'Invalidated'],
  Automated: [],
  Invalidated: [],
}

const normalizeStatus = (value: string): Status | null => {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'for validation') return 'For Validation'
  if (normalized === 'validated') return 'Validated'
  if (normalized === 'for automation') return 'For Automation'
  if (normalized === 'automated') return 'Automated'
  if (normalized === 'invalidated') return 'Invalidated'
  return null
}

const getAllowedTransitions = (status: string): Status[] => {
  const normalizedStatus = normalizeStatus(status)
  if (!normalizedStatus) return []
  return ALLOWED_STATUS_TRANSITIONS[normalizedStatus]
}

/** Removes a leading "For validation:" label from stored description text. */
const stripForValidationDescriptionPrefix = (value: string): string => {
  return String(value ?? '')
    .replace(/^\s*for validation\s*:\s*/i, '')
    .trim()
}

const sheetsSyncErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    const m = error.message.trim()
    if (m.length > 0) {
      return m.length > 360 ? `${m.slice(0, 357)}…` : m
    }
  }
  return fallback
}

function App() {
  const [items, setItems] = useState<ProcessItem[]>([])
  const [newItem, setNewItem] = useState<NewItemForm>(newItemDefaults)
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [dragOriginLane, setDragOriginLane] = useState<{
    step: Step
    status: Status
  } | null>(null)
  const [activeDropLane, setActiveDropLane] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [automationDraft, setAutomationDraft] = useState<NewItemForm | null>(
    null,
  )
  const [editDraft, setEditDraft] = useState<EditItemForm | null>(null)
  const [openCardMenu, setOpenCardMenu] = useState<{
    itemId: string
    right: number
    top: number
  } | null>(null)
  const [syncState, setSyncState] = useState<{
    isLoading: boolean
    message: string | null
  }>({
    isLoading: true,
    message: null,
  })

  useEffect(() => {
    const loadItems = async () => {
      if (!isSheetsConfigured) {
        setSyncState({
          isLoading: false,
          message: 'Google Sheets is not configured. Set VITE_SHEETS_API_URL in .env.',
        })
        setItems([])
        return
      }

      try {
        const remoteItems = await listSheetsItems()
        setItems(
          (remoteItems as ProcessItem[]).map((item) => ({
            ...item,
            description: stripForValidationDescriptionPrefix(item.description),
          })),
        )
        setOpenCardMenu(null)
        setSyncState({ isLoading: false, message: null })
      } catch (error) {
        setSyncState({
          isLoading: false,
          message: sheetsSyncErrorMessage(
            error,
            'Could not load data from Google Sheets.',
          ),
        })
        setItems([])
      }
    }

    void loadItems()
  }, [])

  useEffect(() => {
    if (openCardMenu === null) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('.card-menu')) return
      if (target?.closest?.('[data-card-menu-portal]')) return
      setOpenCardMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [openCardMenu])

  useEffect(() => {
    if (openCardMenu === null) return
    const close = () => setOpenCardMenu(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [openCardMenu])

  useEffect(() => {
    const modalOpen =
      isAddModalOpen || automationDraft !== null || editDraft !== null
    if (!modalOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (isAddModalOpen) {
        setIsAddModalOpen(false)
        setNewItem(newItemDefaults)
      } else if (automationDraft !== null) {
        setAutomationDraft(null)
      } else if (editDraft !== null) {
        setEditDraft(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isAddModalOpen, automationDraft, editDraft])

  const persistItemUpdate = async (item: ProcessItem) => {
    if (!isSheetsConfigured) {
      return
    }

    try {
      await updateSheetsItem(item as SheetsItem)
      setSyncState((prev) => ({ ...prev, message: null }))
    } catch (error) {
      setSyncState((prev) => ({
        ...prev,
        message: sheetsSyncErrorMessage(
          error,
          'A change could not be saved to Google Sheets. Please retry that action.',
        ),
      }))
    }
  }

  const closeAddModal = () => {
    setIsAddModalOpen(false)
    setNewItem(newItemDefaults)
  }

  const openAddForValidation = (step: Step) => {
    setNewItem({ ...newItemDefaults, step })
    setIsAddModalOpen(true)
  }

  const addItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = newItem.title.trim()
    if (!title) return

    const item: ProcessItem = {
      id: crypto.randomUUID(),
      title,
      description: stripForValidationDescriptionPrefix(newItem.description),
      step: newItem.step,
      segment: newItem.segment,
      status: 'For Validation',
    }

    if (isSheetsConfigured) {
      try {
        const created = await createSheetsItem(item as SheetsItem)
        setItems((prev) => [created as ProcessItem, ...prev])
        setSyncState((prev) => ({ ...prev, message: null }))
      } catch (error) {
        setSyncState((prev) => ({
          ...prev,
          message: sheetsSyncErrorMessage(
            error,
            'Failed to create item in Google Sheets. Item was not added.',
          ),
        }))
        return
      }
    } else {
      setItems((prev) => [item, ...prev])
    }

    closeAddModal()
  }

  const moveItem = (itemId: string, nextStep: Step, nextStatus: Status) => {
    const movingItem = items.find((item) => item.id === itemId)
    if (!movingItem) return

    const updatedItem: ProcessItem = {
      ...movingItem,
      step: nextStep,
      status: nextStatus,
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              step: nextStep,
              status: nextStatus,
            }
          : item,
      ),
    )

    void persistItemUpdate(updatedItem)
  }

  const persistNewAutomationItem = async (
    draft: NewItemForm,
  ): Promise<boolean> => {
    const title = draft.title.trim()
    if (!title) return false

    const automationItem: ProcessItem = {
      id: crypto.randomUUID(),
      title,
      description: stripForValidationDescriptionPrefix(draft.description),
      step: draft.step,
      segment: draft.segment,
      status: 'For Automation',
    }

    if (isSheetsConfigured) {
      try {
        const created = await createSheetsItem(automationItem as SheetsItem)
        setItems((prev) => [...prev, created as ProcessItem])
        setSyncState((prev) => ({ ...prev, message: null }))
      } catch (error) {
        setSyncState((prev) => ({
          ...prev,
          message: sheetsSyncErrorMessage(
            error,
            'Failed to create automation copy in Google Sheets. Please retry.',
          ),
        }))
        return false
      }
      return true
    }

    setItems((prev) => [...prev, automationItem])
    return true
  }

  const copyItemToAutomation = async (itemId: string, step: Step) => {
    const sourceItem = items.find((item) => item.id === itemId)
    if (!sourceItem) return
    await persistNewAutomationItem({
      title: sourceItem.title,
      description: sourceItem.description,
      step,
      segment: sourceItem.segment,
    })
  }

  const closeAutomationModal = () => {
    setAutomationDraft(null)
  }

  const openAutomationModal = (item: ProcessItem) => {
    setOpenCardMenu(null)
    setAutomationDraft({
      title: '',
      description: item.title,
      step: item.step,
      segment: item.segment,
    })
  }

  const submitAutomationModal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!automationDraft) return
    const ok = await persistNewAutomationItem(automationDraft)
    if (ok) {
      closeAutomationModal()
    }
  }

  const openEdit = (item: ProcessItem) => {
    setOpenCardMenu(null)
    const normalizedStatus = normalizeStatus(String(item.status))
    setEditDraft({
      id: item.id,
      title: item.title,
      description: stripForValidationDescriptionPrefix(item.description),
      step: item.step,
      segment: item.segment,
      status: normalizedStatus ?? (item.status as Status),
    })
  }

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editDraft) return
    const title = editDraft.title.trim()
    if (!title) return

    const existing = items.find((item) => item.id === editDraft.id)
    if (!existing) return

    const updated: ProcessItem = {
      ...existing,
      title,
      description: stripForValidationDescriptionPrefix(editDraft.description),
      step: editDraft.step,
      segment: editDraft.segment,
      status: editDraft.status,
    }

    if (isSheetsConfigured) {
      try {
        await updateSheetsItem(updated as SheetsItem)
        setItems((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        )
        setEditDraft(null)
        setSyncState((prev) => ({ ...prev, message: null }))
      } catch (error) {
        setSyncState((prev) => ({
          ...prev,
          message: sheetsSyncErrorMessage(
            error,
            'Could not save edits to Google Sheets. Please retry or reload.',
          ),
        }))
      }
      return
    }

    setItems((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item)),
    )
    setEditDraft(null)
  }

  const removeItem = async (itemId: string) => {
    setOpenCardMenu(null)
    if (!window.confirm('Delete this item? This cannot be undone.')) return

    if (isSheetsConfigured) {
      try {
        await deleteSheetsItem(itemId)
        setItems((prev) => prev.filter((item) => item.id !== itemId))
        setSyncState((prev) => ({ ...prev, message: null }))
      } catch (error) {
        setSyncState((prev) => ({
          ...prev,
          message: sheetsSyncErrorMessage(
            error,
            'Could not delete item in Google Sheets. Please retry.',
          ),
        }))
      }
      return
    }

    setItems((prev) => prev.filter((item) => item.id !== itemId))
  }

  const toggleSegment = (itemId: string) => {
    const targetItem = items.find((item) => item.id === itemId)
    if (!targetItem) return

    const updatedItem: ProcessItem = {
      ...targetItem,
      segment: targetItem.segment === 'B2B' ? 'B2C' : 'B2B',
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, segment: item.segment === 'B2B' ? 'B2C' : 'B2B' }
          : item,
      ),
    )

    void persistItemUpdate(updatedItem)
  }

  const draggingItem = draggingItemId
    ? items.find((item) => item.id === draggingItemId) ?? null
    : null

  const isValidDropTarget = (nextStep: Step, nextStatus: Status) => {
    if (!draggingItem) return false
    if (draggingItem.step !== nextStep) return false
    const normalizedSourceStatus = normalizeStatus(draggingItem.status)
    if (!normalizedSourceStatus) return false
    if (normalizedSourceStatus === nextStatus) return false
    return getAllowedTransitions(normalizedSourceStatus).includes(nextStatus)
  }

  const cardMenuItem = openCardMenu
    ? items.find((item) => item.id === openCardMenu.itemId)
    : null

  const visibleStatuses = draggingItem
    ? (() => {
        const normalizedSourceStatus = normalizeStatus(draggingItem.status)
        if (!normalizedSourceStatus) return STATUS_STATES
        const allowed = getAllowedTransitions(normalizedSourceStatus)
        return [normalizedSourceStatus, ...allowed]
      })()
    : STATUS_STATES

  return (
    <main className="dashboard-shell">
      <div className="dashboard">
        <header className="dashboard-header">
          <div className="dashboard-header-lead">
            <h1>Powerhouse Process</h1>
          </div>
          <div className="dashboard-header-meta">
            {syncState.isLoading ? (
              <span className="sync-badge">Loading...</span>
            ) : null}
            {syncState.message ? (
              <span className="sync-message">{syncState.message}</span>
            ) : null}
          </div>
        </header>

        <div className="board-scroll">
          <section className="board">
            {visibleStatuses.map((status) => (
              <article
                key={status}
                className={`status-column ${status.toLowerCase().replace(' ', '-')}`}
              >
                <header className="status-header">
                  <h3>{status}</h3>
                </header>

                <div className="status-column-body">
                  <div
                    className="step-lanes"
                    style={{
                      gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))`,
                    }}
                  >
                  {STEPS.map((step) => (
                    <section key={`${status}-${step}`} className="step-lane-group">
                      <div className="lane-title">{step}</div>
                      <div
                        className={`lane ${
                          draggingItemId ? 'lane-drag-mode' : ''
                        } ${
                          activeDropLane === `${status}__${step}`
                            ? 'lane-drop-target'
                            : ''
                        } ${
                          (draggingItem && !isValidDropTarget(step, status)) ||
                          (dragOriginLane &&
                            dragOriginLane.step === step &&
                            dragOriginLane.status === status)
                            ? 'lane-drop-disabled'
                            : ''
                        }`}
                        onDragOver={(event) => {
                          event.preventDefault()
                          if (!isValidDropTarget(step, status)) {
                            setActiveDropLane(null)
                            return
                          }
                          if (
                            dragOriginLane &&
                            dragOriginLane.step === step &&
                            dragOriginLane.status === status
                          ) {
                            setActiveDropLane(null)
                            return
                          }
                          const laneId = `${status}__${step}`
                          if (activeDropLane !== laneId) {
                            setActiveDropLane(laneId)
                          }
                        }}
                        onDrop={() => {
                          if (!draggingItemId) return
                          if (!isValidDropTarget(step, status)) return
                          if (
                            dragOriginLane &&
                            dragOriginLane.step === step &&
                            dragOriginLane.status === status
                          ) {
                            return
                          }
                          if (
                            draggingItem &&
                            normalizeStatus(draggingItem.status) === 'Validated' &&
                            status === 'For Automation'
                          ) {
                            void copyItemToAutomation(draggingItemId, step)
                          } else {
                            moveItem(draggingItemId, step, status)
                          }
                          setDraggingItemId(null)
                          setDragOriginLane(null)
                          setActiveDropLane(null)
                        }}
                      >
                        {items
                          .filter(
                            (item) => item.step === step && item.status === status,
                          )
                          .map((item) => {
                            const cardStatusNorm = normalizeStatus(
                              String(item.status),
                            )
                            const canDrag =
                              item.status !== 'Automated' &&
                              item.status !== 'Invalidated'
                            const cardDescriptionText =
                              stripForValidationDescriptionPrefix(item.description)
                            const showCardDescription =
                              Boolean(cardDescriptionText) &&
                              cardStatusNorm !== 'For Validation' &&
                              cardStatusNorm !== 'Validated'

                            return (
                              <div
                                key={item.id}
                                className={`item-card ${
                                  canDrag ? '' : 'item-card-static'
                                }`}
                                draggable={canDrag}
                                onDragStart={() => {
                                  if (!canDrag) return
                                  setDraggingItemId(item.id)
                                  setDragOriginLane({
                                    step: item.step,
                                    status: item.status,
                                  })
                                }}
                                onDragEnd={() => {
                                  if (!canDrag) return
                                  setDraggingItemId(null)
                                  setDragOriginLane(null)
                                  setActiveDropLane(null)
                                }}
                              >
                                {canDrag ? (
                                  <div className="drag-handle" aria-hidden="true">
                                    ⋮⋮
                                  </div>
                                ) : null}
                                <button
                                  type="button"
                                  className={`card-segment-badge card-segment-badge-${item.segment.toLowerCase()}`}
                                  onClick={() => toggleSegment(item.id)}
                                  title="Toggle B2B/B2C"
                                >
                                  {item.segment}
                                </button>
                                <div className="item-title">{item.title}</div>
                                {showCardDescription ? (
                                  <p className="item-description">
                                    {cardDescriptionText}
                                  </p>
                                ) : null}
                                <div className="card-actions-row">
                                  {cardStatusNorm === 'Validated' ? (
                                    <button
                                      type="button"
                                      className="automate-button"
                                      onMouseDown={(event) =>
                                        event.stopPropagation()
                                      }
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        openAutomationModal(item)
                                      }}
                                    >
                                      Automate
                                    </button>
                                  ) : null}
                                  <div
                                    className="card-menu"
                                    onMouseDown={(event) =>
                                      event.stopPropagation()
                                    }
                                  >
                                    <button
                                      type="button"
                                      className="card-menu-trigger"
                                      aria-expanded={
                                        openCardMenu?.itemId === item.id
                                      }
                                      aria-haspopup="menu"
                                      aria-label="Card actions"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        const rect =
                                          event.currentTarget.getBoundingClientRect()
                                        setOpenCardMenu((current) =>
                                          current?.itemId === item.id
                                            ? null
                                            : {
                                                itemId: item.id,
                                                right: rect.right,
                                                top: rect.top,
                                              },
                                        )
                                      }}
                                    >
                                      ⋯
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        {activeDropLane === `${status}__${step}` ? (
                          <div className="drop-placeholder-card" aria-hidden="true">
                            <span className="drop-placeholder-plus">+</span>
                          </div>
                        ) : null}
                        {status === 'For Validation' ? (
                          <button
                            type="button"
                            className="validation-add-card"
                            aria-label={`Add item in ${step}, For Validation`}
                            onClick={() => openAddForValidation(step)}
                          >
                            +
                          </button>
                        ) : null}
                      </div>
                    </section>
                  ))}
                  </div>
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>

      {openCardMenu && cardMenuItem
        ? createPortal(
            <div
              data-card-menu-portal
              className="card-menu-portal-root"
              style={{
                position: 'fixed',
                left: openCardMenu.right,
                top: openCardMenu.top,
                transform: 'translate(-100%, calc(-100% - 4px))',
              }}
              role="presentation"
            >
              <div className="card-menu-dropdown" role="menu">
                <button
                  type="button"
                  className="card-menu-item"
                  role="menuitem"
                  onClick={() => openEdit(cardMenuItem)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="card-menu-item card-menu-item-danger"
                  role="menuitem"
                  onClick={() => void removeItem(cardMenuItem.id)}
                >
                  Delete
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {isAddModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeAddModal}
        >
          <section
            className="add-item modal-panel modal-panel--structured"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-item-modal-title"
            aria-describedby="add-item-modal-desc"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-panel-header">
              <div className="add-item-header">
                <h2 id="add-item-modal-title">Add new item</h2>
                <p id="add-item-modal-desc">
                  New card in <strong>For Validation</strong> under{' '}
                  <strong>{newItem.step}</strong>. Drag it on the board when ready.
          </p>
        </div>
        <button
          type="button"
                className="modal-close"
                aria-label="Close"
                onClick={(event) => {
                  event.stopPropagation()
                  closeAddModal()
                }}
              >
                ×
              </button>
            </header>
            <form className="modal-form" onSubmit={addItem}>
              <div className="modal-panel-body">
                <div className="modal-simple-fields">
                  <div className="field">
                    <label htmlFor="item-title">
                      Title <span className="field-required">*</span>
                    </label>
                    <input
                      id="item-title"
                      type="text"
                      placeholder="e.g. Messenger bot intake"
                      autoComplete="off"
                      value={newItem.title}
                      onChange={(event) =>
                        setNewItem((prev) => ({
                          ...prev,
                          title: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="item-segment">Segment</label>
                    <select
                      id="item-segment"
                      value={newItem.segment}
                      onChange={(event) =>
                        setNewItem((prev) => ({
                          ...prev,
                          segment: event.target.value as Segment,
                        }))
                      }
                    >
                      {SEGMENTS.map((segment) => (
                        <option key={segment} value={segment}>
                          {segment}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <footer className="modal-panel-footer">
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closeAddModal}
                  >
                    Cancel
                  </button>
                  <button type="submit">Add to board</button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {automationDraft ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeAutomationModal}
        >
          <section
            className="add-item modal-panel modal-panel--structured"
            role="dialog"
            aria-modal="true"
            aria-labelledby="automate-item-modal-title"
            aria-describedby="automate-item-modal-desc"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-panel-header">
              <div className="add-item-header">
                <h2 id="automate-item-modal-title">Send to automation</h2>
                <p id="automate-item-modal-desc">
                  New <strong>For Automation</strong> card in{' '}
                  <strong>{automationDraft.step}</strong>. Your validated card does
                  not move.
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={(event) => {
                  event.stopPropagation()
                  closeAutomationModal()
                }}
              >
                ×
              </button>
            </header>
            <form
              className="modal-form"
              onSubmit={(event) => void submitAutomationModal(event)}
            >
              <div className="modal-panel-body">
                <div className="modal-simple-fields">
                  <div className="field">
                    <label htmlFor="automate-item-title">
                      Title <span className="field-required">*</span>
                    </label>
                    <input
                      id="automate-item-title"
                      type="text"
                      placeholder="Name for the new card"
                      autoComplete="off"
                      value={automationDraft.title}
                      onChange={(event) =>
                        setAutomationDraft((prev) =>
                          prev ? { ...prev, title: event.target.value } : prev,
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="automate-item-description">
                      Context (optional)
                    </label>
                    <input
                      id="automate-item-description"
                      type="text"
                      placeholder="Prefilled from validated title — edit if needed"
                      autoComplete="off"
                      value={automationDraft.description}
                      onChange={(event) =>
                        setAutomationDraft((prev) =>
                          prev
                            ? { ...prev, description: event.target.value }
                            : prev,
                        )
                      }
                    />
                  </div>
                </div>
              </div>
              <footer className="modal-panel-footer">
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closeAutomationModal}
                  >
                    Cancel
        </button>
                  <button type="submit">Create automation row</button>
                </div>
              </footer>
            </form>
      </section>
        </div>
      ) : null}

      {editDraft ? (
        <div
          className="modal-backdrop"
                  role="presentation"
          onClick={() => setEditDraft(null)}
        >
          <section
            className="add-item modal-panel modal-panel--structured"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-item-modal-title"
            aria-describedby="edit-item-modal-desc"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-panel-header">
              <div className="add-item-header">
                <h2 id="edit-item-modal-title">Edit item</h2>
                <p id="edit-item-modal-desc">
                  Updates this card and saves to Google Sheets when you confirm.
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={(event) => {
                  event.stopPropagation()
                  setEditDraft(null)
                }}
              >
                ×
              </button>
            </header>
            <form className="modal-form" onSubmit={saveEdit}>
              <div className="modal-panel-body">
                <div
                  className="modal-section"
                  role="group"
                  aria-labelledby="edit-section-details"
                >
                  <h3 className="modal-section-title" id="edit-section-details">
                    Details
                  </h3>
                  <div className="modal-form-grid">
                    <div className="field field-wide">
                      <label htmlFor="edit-item-title">
                        Title <span className="field-required">*</span>
                      </label>
                      <span className="field-hint" id="edit-title-hint">
                        Card headline.
                      </span>
                      <input
                        id="edit-item-title"
                        type="text"
                        autoComplete="off"
                        aria-describedby="edit-title-hint"
                        value={editDraft.title}
                        onChange={(event) =>
                          setEditDraft((prev) =>
                            prev ? { ...prev, title: event.target.value } : prev,
                          )
                        }
                      />
                    </div>
                    <div className="field field-wide">
                      <label htmlFor="edit-item-description">Notes</label>
                      <span className="field-hint" id="edit-desc-hint">
                        Optional; shown from For Automation onward.
                      </span>
                      <input
                        id="edit-item-description"
                        type="text"
                        autoComplete="off"
                        aria-describedby="edit-desc-hint"
                        value={editDraft.description}
                        onChange={(event) =>
                          setEditDraft((prev) =>
                            prev
                              ? { ...prev, description: event.target.value }
                              : prev,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
                <div
                  className="modal-section"
                  role="group"
                  aria-labelledby="edit-section-workflow"
                >
                  <h3 className="modal-section-title" id="edit-section-workflow">
                    Workflow
                  </h3>
                  <p className="modal-section-lead">
                    Step is the column; status is the row on the board.
                  </p>
                  <div className="modal-form-grid modal-form-grid--workflow">
                    <div className="field">
                      <label htmlFor="edit-item-step">Step</label>
                      <span className="field-hint">Process column.</span>
                      <select
                        id="edit-item-step"
                        value={editDraft.step}
                        onChange={(event) =>
                          setEditDraft((prev) =>
                            prev
                              ? { ...prev, step: event.target.value as Step }
                              : prev,
                          )
                        }
                      >
                        {STEPS.map((step) => (
                          <option key={step} value={step}>
                            {step}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="edit-item-status">Status</label>
                      <span className="field-hint">Lane / stage.</span>
                      <select
                        id="edit-item-status"
                        value={editDraft.status}
                        onChange={(event) =>
                          setEditDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  status: event.target.value as Status,
                                }
                              : prev,
                          )
                        }
                      >
                        {STATUS_STATES.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field field-span-workflow">
                      <label htmlFor="edit-item-segment">Segment</label>
                      <span className="field-hint">B2B or B2C badge.</span>
                      <select
                        id="edit-item-segment"
                        value={editDraft.segment}
                        onChange={(event) =>
                          setEditDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  segment: event.target.value as Segment,
                                }
                              : prev,
                          )
                        }
                      >
                        {SEGMENTS.map((segment) => (
                          <option key={segment} value={segment}>
                            {segment}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <footer className="modal-panel-footer">
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setEditDraft(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit">Save to Sheets</button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
