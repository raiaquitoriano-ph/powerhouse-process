export type SheetsItem = {
  id: string
  title: string
  description: string
  step: string
  status: string
  segment: string
  createdAt?: string
  updatedAt?: string
}

type SheetsApiResponse<T> = {
  ok: boolean
  error?: string
} & T

const SHEETS_API_URL = (import.meta.env.VITE_SHEETS_API_URL ?? '').trim()

export const isSheetsConfigured = SHEETS_API_URL.length > 0

const FETCH_FAILED_HINT =
  'Could not reach the Google Sheets web app (browser "Failed to fetch"). Check: VITE_SHEETS_API_URL is the full /exec URL; Apps Script → Deploy → Web app → Who has access = Anyone; no ad-blocker blocking script.google.com; try opening the URL in a new tab once to authorize.'

async function sheetsFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (
      msg === 'Failed to fetch' ||
      msg.includes('NetworkError when attempting to fetch resource') ||
      msg.includes('Load failed')
    ) {
      throw new Error(FETCH_FAILED_HINT, { cause: error })
    }
    throw error
  }
}

const request = async <T>(init?: RequestInit): Promise<SheetsApiResponse<T>> => {
  if (!isSheetsConfigured) {
    throw new Error('Google Sheets API URL is not configured.')
  }

  const response = await sheetsFetch(SHEETS_API_URL, init)
  const text = await response.text()

  let data: SheetsApiResponse<T>
  try {
    data = JSON.parse(text) as SheetsApiResponse<T>
  } catch {
    throw new Error(
      `Sheets returned non-JSON (HTTP ${response.status}). Check the web app URL and deployment.`,
    )
  }

  if (!response.ok) {
    const fromBody =
      typeof data.error === 'string' && data.error.trim() ? data.error.trim() : ''
    throw new Error(
      fromBody || `Sheets request failed with HTTP ${response.status}.`,
    )
  }

  return data
}

export const listSheetsItems = async (): Promise<SheetsItem[]> => {
  if (!isSheetsConfigured) {
    throw new Error('Google Sheets API URL is not configured.')
  }

  const listUrl = `${SHEETS_API_URL}?action=list`
  const response = await sheetsFetch(listUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  const text = await response.text()
  let data: SheetsApiResponse<{
    items?: SheetsItem[]
  }>
  try {
    data = JSON.parse(text) as SheetsApiResponse<{ items?: SheetsItem[] }>
  } catch {
    throw new Error(
      `Sheets list returned non-JSON (HTTP ${response.status}). Check the web app URL and deployment.`,
    )
  }

  if (!response.ok) {
    const fromBody =
      typeof data.error === 'string' && data.error.trim() ? data.error.trim() : ''
    throw new Error(
      fromBody || `Sheets request failed with HTTP ${response.status}.`,
    )
  }

  if (!data.ok) {
    throw new Error(data.error ?? 'Failed to list items from Sheets.')
  }

  return data.items ?? []
}

export const createSheetsItem = async (
  item: SheetsItem,
): Promise<SheetsItem> => {
  const data = await request<{ item?: SheetsItem }>({
    method: 'POST',
    headers: {
      // text/plain avoids CORS preflight for Apps Script web apps.
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'create',
      item,
    }),
  })

  if (!data.ok || !data.item) {
    throw new Error(data.error ?? 'Failed to create item in Sheets.')
  }

  return data.item
}

export const updateSheetsItem = async (
  item: SheetsItem,
): Promise<SheetsItem> => {
  const data = await request<{ item?: SheetsItem }>({
    method: 'POST',
    headers: {
      // text/plain avoids CORS preflight for Apps Script web apps.
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'update',
      item,
    }),
  })

  if (!data.ok || !data.item) {
    throw new Error(data.error ?? 'Failed to update item in Sheets.')
  }

  return data.item
}

export const deleteSheetsItem = async (id: string): Promise<void> => {
  const data = await request<{ deleted?: boolean }>({
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'delete',
      id,
    }),
  })

  if (!data.ok) {
    throw new Error(data.error ?? 'Failed to delete item in Sheets.')
  }
}
