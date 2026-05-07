import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  createSheetsItem,
  isSheetsConfigured,
  listSheetsItems,
  updateSheetsItem,
  type SheetsItem,
} from './sheetsApi'

type Step =
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
  status: Status
}

const STEPS: Step[] = [
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
  step: 'Bill Collection',
  segment: 'B2C',
  status: 'For Validation',
}

const ALLOWED_STATUS_TRANSITIONS: Record<Status, Status[]> = {
  'For Validation': ['Validated', 'Invalidated'],
  Validated: ['For Automation'],
  'For Automation': ['Invalidated'],
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
        setItems(remoteItems as ProcessItem[])
        setSyncState({ isLoading: false, message: null })
      } catch {
        setSyncState({
          isLoading: false,
          message: 'Could not load data from Google Sheets.',
        })
        setItems([])
      }
    }

    void loadItems()
  }, [])

  const persistItemUpdate = async (item: ProcessItem) => {
    if (!isSheetsConfigured) {
      return
    }

    try {
      await updateSheetsItem(item as SheetsItem)
      setSyncState((prev) => ({ ...prev, message: null }))
    } catch {
      setSyncState((prev) => ({
        ...prev,
        message:
          'A change could not be saved to Google Sheets. Please retry that action.',
      }))
    }
  }

  const addItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = newItem.title.trim()
    if (!title) return

    const item: ProcessItem = {
      id: crypto.randomUUID(),
      title,
      description: newItem.description.trim(),
      step: newItem.step,
      segment: newItem.segment,
      status: newItem.status,
    }

    if (isSheetsConfigured) {
      try {
        const created = await createSheetsItem(item as SheetsItem)
        setItems((prev) => [created as ProcessItem, ...prev])
        setSyncState((prev) => ({ ...prev, message: null }))
      } catch {
        setSyncState((prev) => ({
          ...prev,
          message:
            'Failed to create item in Google Sheets. Item was not added.',
        }))
        return
      }
    } else {
      setItems((prev) => [item, ...prev])
    }

    setNewItem(newItemDefaults)
    setIsAddModalOpen(false)
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

  const copyItemToAutomation = async (itemId: string, step: Step) => {
    const sourceItem = items.find((item) => item.id === itemId)
    if (!sourceItem) return

    const copiedItem: ProcessItem = {
      ...sourceItem,
      id: crypto.randomUUID(),
      step,
      status: 'For Automation',
    }

    if (isSheetsConfigured) {
      try {
        const created = await createSheetsItem(copiedItem as SheetsItem)
        setItems((prev) => [...prev, created as ProcessItem])
        setSyncState((prev) => ({ ...prev, message: null }))
      } catch {
        setSyncState((prev) => ({
          ...prev,
          message:
            'Failed to create automation copy in Google Sheets. Please retry.',
        }))
      }
      return
    }

    setItems((prev) => [...prev, copiedItem])
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
          <h1>Powerhouse Process</h1>
          {syncState.isLoading ? (
            <span className="sync-badge">Loading...</span>
          ) : null}
          {syncState.message ? (
            <span className="sync-message">{syncState.message}</span>
          ) : null}
          <button
            type="button"
            className="open-modal-button"
            onClick={() => setIsAddModalOpen(true)}
          >
            Add New Item
          </button>
        </header>

        <div className="board-scroll">
          <p className="board-hint">
            Drag cards between lanes to update step and status.
          </p>
          <section className="board">
            {visibleStatuses.map((status) => (
              <article
                key={status}
                className={`status-column ${status.toLowerCase().replace(' ', '-')}`}
              >
                <header className="status-header">
                  <h3>{status}</h3>
                </header>

                <div className="step-lanes">
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
                            const canDrag =
                              item.status !== 'Automated' &&
                              item.status !== 'Invalidated'

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
                                  className="card-segment-badge"
                                  onClick={() => toggleSegment(item.id)}
                                  title="Toggle B2B/B2C"
                                >
                                  {item.segment}
                                </button>
                                <div className="item-title">{item.title}</div>
                                {item.description ? (
                                  <p className="item-description">{item.description}</p>
                                ) : null}
                              </div>
                            )
                          })}
                        {activeDropLane === `${status}__${step}` ? (
                          <div className="drop-placeholder-card" aria-hidden="true">
                            <span className="drop-placeholder-plus">+</span>
                          </div>
                        ) : null}
                      </div>
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>

      {isAddModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsAddModalOpen(false)}
        >
          <section
            className="add-item modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-item-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="add-item-header">
              <h2 id="add-item-modal-title">Add New Item</h2>
              <p>Add a process entry and drop it into the right workflow lane.</p>
            </div>
            <form onSubmit={addItem}>
              <div className="field field-wide">
                <label htmlFor="item-title">Item title</label>
                <input
                  id="item-title"
                  type="text"
                  placeholder="e.g. Admin confirms OCR output"
                  value={newItem.title}
                  onChange={(event) =>
                    setNewItem((prev) => ({ ...prev, title: event.target.value }))
                  }
                />
              </div>

              <div className="field field-wide">
                <label htmlFor="item-description">Description</label>
                <input
                  id="item-description"
                  type="text"
                  placeholder="Optional details"
                  value={newItem.description}
                  onChange={(event) =>
                    setNewItem((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="field">
                <label htmlFor="item-step">Step</label>
                <select
                  id="item-step"
                  value={newItem.step}
                  onChange={(event) =>
                    setNewItem((prev) => ({
                      ...prev,
                      step: event.target.value as Step,
                    }))
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
                <label htmlFor="item-status">Status</label>
                <select
                  id="item-status"
                  value={newItem.status}
                  onChange={(event) =>
                    setNewItem((prev) => ({
                      ...prev,
                      status: event.target.value as Status,
                    }))
                  }
                >
                  {STATUS_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
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

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit">Add to Board</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
