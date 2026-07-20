export interface AnalyticsBreakdown {
  name: string
  count: number
}

export interface TicketDatePoint {
  period: string
  label: string
  created: number
  resolved: number
}

export interface TicketProductDatePoint {
  period: string
  label: string
  values: Record<string, number>
}

export interface TicketAggregateRow {
  client: string
  product: string
  category: string
  volume: number
  avg_first_response_hours: number | null
  open: number
  resolved: number
}

export interface TicketAnalyticsFilterOptions {
  categories: string[]
  classifications: string[]
  products: string[]
  clients: string[]
  statuses: string[]
  priorities: string[]
}

export interface TicketAnalyticsResponse {
  total: number
  open: number
  resolved: number
  previous_total: number
  volume_change_pct: number | null
  avg_first_response_hours: number | null
  fcr_rate: number
  by_product: AnalyticsBreakdown[]
  by_category: AnalyticsBreakdown[]
  by_classification: AnalyticsBreakdown[]
  by_status: AnalyticsBreakdown[]
  by_priority: AnalyticsBreakdown[]
  by_date: TicketDatePoint[]
  by_product_date: TicketProductDatePoint[]
  top_clients: AnalyticsBreakdown[]
  aggregates: TicketAggregateRow[]
  filter_options: TicketAnalyticsFilterOptions
  meta: {
    from: string
    to: string
    granularity: 'day' | 'week' | 'month'
    generated_at: string
    source_ticket_count: number
    unfiltered_total: number
    source_truncated: boolean
    aggregates_truncated: boolean
    fcr_is_estimate: boolean
  }
}

export interface TicketAnalyticsFilters {
  products: string[]
  categories: string[]
  classifications: string[]
  statuses: string[]
  priorities: string[]
  client: string | null
}
