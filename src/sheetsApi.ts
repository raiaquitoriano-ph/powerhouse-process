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

const request = async <T>(init?: RequestInit): Promise<SheetsApiResponse<T>> => {
  if (!isSheetsConfigured) {
    throw new Error('Google Sheets API URL is not configured.')
  }

  const response = await fetch(SHEETS_API_URL, init)
  if (!response.ok) {
    throw new Error(`Sheets request failed with status ${response.status}`)
  }

  return (await response.json()) as SheetsApiResponse<T>
}

export const listSheetsItems = async (): Promise<SheetsItem[]> => {
  if (!isSheetsConfigured) {
    throw new Error('Google Sheets API URL is not configured.')
  }

  const listUrl = `${SHEETS_API_URL}?action=list`
  const response = await fetch(listUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Sheets request failed with status ${response.status}`)
  }

  const data = (await response.json()) as SheetsApiResponse<{
    items?: SheetsItem[]
  }>

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
