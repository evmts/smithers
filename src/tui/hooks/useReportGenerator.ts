// Hook for auto-generating 10-minute reports

import { useState, useEffect, useCallback } from 'react'
import type { SmithersDB } from '../../db/index.js'
import { generateReport, type Report } from '../services/report-generator.js'

const REPORT_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

export interface UseReportGeneratorResult {
  reports: Report[]
  isGenerating: boolean
  lastGeneratedAt: string | null
  generateNow: () => Promise<void>
}

export function useReportGenerator(db: SmithersDB): UseReportGeneratorResult {
  const [reports, setReports] = useState<Report[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null)

  // Load existing reports from database
  useEffect(() => {
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
    const interval = setInterval(loadReports, 5000)
    return () => clearInterval(interval)
  }, [db])

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
  }, [db])

  // Auto-generate reports every 10 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      generateNow()
    }, REPORT_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [generateNow])

  return {
    reports,
    isGenerating,
    lastGeneratedAt,
    generateNow
  }
}
