import { useState } from 'react'
import { buildReport, snapshotCanvases, type ReportInput } from '../../sim/report'
import { Icon } from '../controls'

/**
 * "Report": who it's from and for, then print / save as PDF or download.
 * `inline` shows the form in place (the Recommend tab, phones) instead of a popover.
 */
export function ReportButton({ make, inline, label = 'Report' }: {
  make: () => Omit<ReportInput, 'images' | 'preparedFor' | 'project' | 'appUrl' | 'preparedBy'>
  inline?: boolean
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [preparedBy, setBy] = useState(() => safeGet('il.report.by'))
  const [preparedFor, setFor] = useState(() => safeGet('il.report.for'))
  const [project, setProject] = useState(() => safeGet('il.report.project'))
  const html = () => {
    safeSet('il.report.by', preparedBy)
    safeSet('il.report.for', preparedFor)
    safeSet('il.report.project', project)
    return buildReport({ ...make(), images: snapshotCanvases(), preparedFor, project, preparedBy, appUrl: location.origin })
  }
  const download = () => {
    const blob = new Blob([html()], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const slug = (project || 'insulation-assessment').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    a.download = `${slug || 'insulation-assessment'}.html`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return download()
    w.document.open()
    w.document.write(html())
    w.document.close()
    w.onload = () => setTimeout(() => w.print(), 300)
  }
  const form = (
    <>
      <label className="rp-field"><span>Prepared by</span><input value={preparedBy} placeholder="Your company or name" onChange={(e) => setBy(e.target.value)} /></label>
      <label className="rp-field"><span>Prepared for</span><input value={preparedFor} placeholder="Customer or contact" onChange={(e) => setFor(e.target.value)} /></label>
      <label className="rp-field"><span>Project</span><input value={project} placeholder="Project or line tag" onChange={(e) => setProject(e.target.value)} /></label>
      <div className="scn-actions">
        <button className="primary" onClick={print}><Icon name="book" size={15} /> Save as PDF</button>
        <button className="tool" onClick={download}>Download file</button>
      </div>
      <p className="field-note">Save as PDF opens the report and your print screen — choose "Save as PDF" (on iPhone: Share → Save to Files, or Print). It includes the inputs, results, every requirement and its source.</p>
    </>
  )
  if (inline) {
    return (
      <div className={`rp-inline ${open ? 'open' : ''}`}>
        <button className={open ? 'tool rp-toggle' : 'primary rp-toggle'} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="book" size={16} /> {open ? 'Hide report options' : label}
        </button>
        {open && <div className="rp-form">{form}</div>}
      </div>
    )
  }
  return (
    <div className="scenarios">
      <button className="tool" aria-label="Report" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="book" size={15} /> <span>{label}</span></button>
      {open && <div className="scn-pop" role="dialog" aria-label="Report">{form}</div>}
    </div>
  )
}

function safeGet(k: string) {
  try {
    return localStorage.getItem(k) ?? ''
  } catch {
    return ''
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v)
  } catch {
    // private mode: nothing to remember
  }
}
