export const MAX_FILE_MB = 10
export const MAX_FILES = 10
/** Short type tag of a file in the list (from its extension) */
const fileTag = (f: File) => (/\.([a-z0-9]{1,5})$/i.exec(f.name)?.[1] ?? 'file').toUpperCase()
const sizeText = (f: File) => (f.size >= 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`)

/** What stops the files from being saved: none picked (when required), too many, too large */
export function fileProblems(files: File[], required: string): string[] {
  return [
    !!required && files.length === 0 ? required : '',
    files.length > MAX_FILES ? `Attach at most ${MAX_FILES} files — remove ${files.length - MAX_FILES}` : '',
    ...files.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024).map((f) => `${f.name} is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_FILE_MB} MB per file`),
  ].filter(Boolean)
}

/** File field of a receipt / delivery note: a small + Add above the list of picked files (any format, up to 10, 10 MB each) */
export function FileAttach({ label, inputLabel, files, onChange, required }: { label: string; inputLabel: string; files: File[]; onChange: (files: File[]) => void; required?: boolean }) {
  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? [])
    onChange([...files, ...picked.filter((f) => !files.some((x) => x.name === f.name && x.size === f.size))])
  }
  return (
    <div className="gc-field gc-po-form__wide">
      <span className="gc-label">
        {label}
        {required && <span className="gc-danger"> *</span>}
      </span>
      <label className="gc-rcv__add">
        <input type="file" multiple onChange={(e) => (add(e.target.files), (e.target.value = ''))} aria-label={inputLabel} aria-required={required || undefined} />
        <span>+ Add</span>
      </label>
      <p className="gc-small gc-soft gc-rcv__accept">
        Any format — PDF, images (JPG, PNG, HEIC), Word, Excel, CSV, text and others. Up to {MAX_FILES} files, {MAX_FILE_MB} MB each.{required ? ' At least one file is required.' : ''}
      </p>
      {files.length > 0 && (
        <ul className="gc-rcv__files" aria-label="Files to attach">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}`}>
              <span className="gc-rcv__ftype">{fileTag(f)}</span>
              <span className="gc-rcv__fname" title={f.name}>
                {f.name}
              </span>
              <span className="gc-small gc-soft">{sizeText(f)}</span>
              <button type="button" className="gc-icon-btn" aria-label={`Remove ${f.name}`} title="Remove this file" onClick={() => onChange(files.filter((_x, n) => n !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
