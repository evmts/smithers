// Hook for auto-generating 10-minute reports

import { useCallback } from 'react'
import type { SmithersDB } from '../../db/index.js'
import { generateReport, type Report } from '../services/report-generator.js'
import { useEffectOnValueChange } from '../../reconciler/hooks.js'
import { useTuiState } from '../state.js'

const REPORT_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

export interface UseReportGeneratorResult {
  reports: Report[]
  isGenerating: boolean
  lastGeneratedAt: string | null
  generateNow: () => Promise<void>
}

const REPORTS_KEY = 'tui:reports:list'
const GENERATING_KEY = 'tui:reports:generating'
const LAST_GENERATED_KEY = 'tui:reports:lastGeneratedAt'
const EMPTY_REPORTS: Report[] = []

export function useReportGenerator(db: SmithersDB): UseReportGeneratorResult {
  const [reports, setReports] = useTuiState<Report[]>(REPORTS_KEY, EMPTY_REPORTS)
  const [isGenerating, setIsGenerating] = useTuiState<boolean>(GENERATING_KEY, false)
  const [lastGeneratedAt, setLastGeneratedAt] = useTuiState<string | null>(LAST_GENERATED_KEY, null)

  const generateNow = useCallback(async () => {
    setIsGenerating(true)
    try {
      const report = await generateReport(db)
      if (report) {
        setReports(prev => [report, ...prev])
        setLastGeneratedAt(new Date().toISOString())
      }
    } catch (err) {
      console.debug('[useReportGenerator] Generate error:', err)
    } finally {
      setIsGenerating(false)
    }
  }, [db, setIsGenerating, setReports, setLastGeneratedAt])

  useEffectOnValueChange(db, () => {
    const loadReports = () => {
      try {
        const dbReports = db.query<Report>(
          "SELECT * FROM reports WHERE type = 'auto_summary' ORDER BY created_at DESC LIMIT 50"
        )
        setReports(dbReports)
      } catch (err) {
        console.debug('[useReportGenerator] Load error:', err)
      }
    }

    loadReports()
    const loadInterval = setInterval(loadReports, 5000)
    const generateInterval = setInterval(() => {
      generateNow()
    }, REPORT_INTERVAL_MS)

    return () => {
      clearInterval(loadInterval)
      clearInterval(generateInterval)
    }
  }, [db, generateNow, setReports])

  return {
    reports,
    isGenerating,
    lastGeneratedAt,
    generateNow
  }
}
