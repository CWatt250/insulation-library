import { useState } from 'react'
import { buildReport, snapshotCanvases, type ReportInput } from '../../sim/report'
import { Icon } from '../controls'

/** "Report" menu: who it's for, then download as HTML or print to PDF. */
export function ReportButton({ make }: { make: () => Omit<ReportInput, 'images' | 'preparedFor' | 'project' | 'appUrl'> }) {
  const [open, setOpen] = useState(false)
  const [preparedFor, setFor] = useState(() => safeGet('il.report.for'))
  const [project, setProject] = useState(() => safeGet('il.report.project'))
  const html = () => {
    safeSet('il.report.for', preparedFor)
    safeSet('il.report.project', project)
    return buildReport({ ...make(), images: snapshotCanvases(), preparedFor, project, appUrl: location.origin })
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
  return (
    <div className="scenarios">
      <button className="tool" aria-label="Report" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="book" size={15} /> <span>Report</span></button>
      {open && (
        <div className="scn-pop" role="dialog" aria-label="Report">
          <label className="rp-field"><span>Prepared for</span><input value={preparedFor} placeholder="Customer or contact" onChange={(e) => setFor(e.target.value)} /></label>
          <label className="rp-field"><span>Project</span><input value={project} placeholder="Project or line tag" onChange={(e) => setProject(e.target.value)} /></label>
          <div className="scn-actions">
            <button className="primary" onClick={print}>Print / save PDF</button>
            <button className="tool" onClick={download}>Download HTML</button>
          </div>
          <p className="field-note">Includes the 3D view as shown, inputs, results, the thickness design, checks, assumptions and every source.</p>
        </div>
      )}
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
