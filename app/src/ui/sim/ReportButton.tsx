import { useState } from 'react'
import { buildReport, snapshotCanvases, type ReportInput } from '../../sim/report'
import { Icon } from '../controls'

/**
 * "Report": who it's from and for, then print / save as PDF or download.
 * `inline` shows the form in place (the Recommend tab, phones) instead of a popover.
 */
/** Who a document is from and for, and where the app lives. */
export interface Who { preparedFor: string; preparedBy: string; project: string; appUrl: string }

export function ReportButton({ make, build, inline, label = 'Report', note, fileSlug = 'insulation-assessment' }: {
  make?: () => Omit<ReportInput, 'images' | 'preparedFor' | 'project' | 'appUrl' | 'preparedBy'>
  /** Builds another document (the savings proposal) instead of the assessment report. */
  build?: (who: Who) => string
  inline?: boolean
  label?: string
  /** What the document holds, under the buttons. */
  note?: string
  fileSlug?: string
}) {
  const [open, setOpen] = useState(false)
  const [preparedBy, setBy] = useState(() => safeGet('il.report.by'))
  const [preparedFor, setFor] = useState(() => safeGet('il.report.for'))
  const [project, setProject] = useState(() => safeGet('il.report.project'))
  const html = () => {
    safeSet('il.report.by', preparedBy)
    safeSet('il.report.for', preparedFor)
    safeSet('il.report.project', project)
    const who = { preparedFor, project, preparedBy, appUrl: location.origin }
    return build ? build(who) : buildReport({ ...make!(), images: snapshotCanvases(), ...who })
  }
  const download = () => {
    const blob = new Blob([html()], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const slug = (project ? `${project} ${build ? fileSlug : ''}` : fileSlug).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    a.download = `${slug || fileSlug}.html`
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
      <p className="field-note">Save as PDF opens the {build ? 'proposal' : 'report'} and your print screen — choose "Save as PDF" (on iPhone: Share → Save to Files, or Print). {note ?? 'It includes the inputs, results, every requirement and its source.'}</p>
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
