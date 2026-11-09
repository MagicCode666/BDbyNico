import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../../auth/useAuth'
import FormMessage from '../../components/FormMessage'
import PageLayout from '../../components/PageLayout'
import { findExistingItems, ImportLimitError } from './api'
import ExistingDialog from './ExistingDialog'
import type { ExistingItem } from './merge'
import {
  PHASE_LABELS,
  runImport,
  type ExistingMode,
  type ImportProgress,
  type ImportReport,
} from './runImport'
import type { ImportPlan } from './types'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ISSUES_SHOWN = 50

type Step =
  | { kind: 'choose' }
  | { kind: 'reading' }
  | { kind: 'preview'; fileName: string; plan: ImportPlan; existing: Map<string, ExistingItem> }
  | { kind: 'running'; progress: ImportProgress | null }
  | { kind: 'done'; report: ImportReport }

export default function ImportPage() {
  const { user } = useAuth()
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [error, setError] = useState<string | null>(null)
  const [askExisting, setAskExisting] = useState(false)

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // permet de rechoisir le même fichier
    if (!file) return
    setError(null)
    if (file.size > MAX_FILE_BYTES) {
      return setError('Ce fichier est trop volumineux (5 Mo maximum).')
    }

    setStep({ kind: 'reading' })
    try {
      // Chargé à la demande : l'analyse des CSV n'alourdit pas le reste de l'application
      const { parseBubbleCsv, ImportFormatError } = await import('./bubble')
      let plan: ImportPlan
      try {
        plan = parseBubbleCsv(await file.text())
      } catch (e) {
        throw e instanceof ImportFormatError ? e : new Error('Impossible de lire ce fichier.')
      }
      if (plan.rows.length === 0) throw new Error('Aucun album à importer dans ce fichier.')
      const existing = await findExistingItems(plan.rows.map((row) => row.isbn))
      setStep({ kind: 'preview', fileName: file.name, plan, existing })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de lire ce fichier.')
      setStep({ kind: 'choose' })
    }
  }

  async function start(mode: ExistingMode) {
    if (step.kind !== 'preview' || !user) return
    const { plan, existing } = step
    setAskExisting(false)
    setError(null)
    setStep({ kind: 'running', progress: null })
    try {
      const report = await runImport(user.id, plan, existing, mode, (progress) =>
        setStep({ kind: 'running', progress }),
      )
      setStep({ kind: 'done', report })
    } catch (e) {
      setError(
        e instanceof ImportLimitError
          ? `${e.message} Réessayez demain, ou importez le fichier en deux fois.`
          : "L'import s'est interrompu. Vous pouvez le relancer : les albums déjà ajoutés seront ignorés.",
      )
      setStep({ kind: 'choose' })
    }
  }

  return (
    <PageLayout title="Importer une collection">
      {error && (
        <div className="mb-4">
          <FormMessage kind="error">{error}</FormMessage>
        </div>
      )}

      {step.kind === 'choose' && (
        <section className="flex max-w-lg flex-col gap-3">
          <p className="text-slate-600">
            Importez l'export CSV de votre collection <strong>Bubble</strong>. Le fichier est lu
            dans votre navigateur : vous pourrez vérifier son contenu avant que quoi que ce soit ne
            soit enregistré.
          </p>
          <label className="flex cursor-pointer flex-col gap-1">
            <span className="text-sm font-medium">Fichier CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="rounded border border-slate-300 p-2 text-sm"
            />
          </label>
        </section>
      )}

      {step.kind === 'reading' && <p className="text-slate-600">Lecture du fichier…</p>}

      {step.kind === 'preview' && (
        <Preview
          step={step}
          onStart={() => (step.existing.size > 0 ? setAskExisting(true) : void start('skip'))}
          onCancel={() => setStep({ kind: 'choose' })}
        />
      )}

      {step.kind === 'running' && (
        <section role="status" className="flex max-w-lg flex-col gap-2">
          <p className="font-medium">
            {step.progress ? PHASE_LABELS[step.progress.phase] : 'Préparation…'}
          </p>
          {step.progress && step.progress.total > 0 && (
            <>
              <div className="h-2 overflow-hidden rounded bg-slate-100">
                <div
                  className="h-full bg-indigo-600"
                  style={{ width: `${(step.progress.done / step.progress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-slate-600">
                {step.progress.done} / {step.progress.total}
              </p>
            </>
          )}
          <p className="text-sm text-slate-500">Ne fermez pas cette page pendant l'import.</p>
        </section>
      )}

      {step.kind === 'done' && (
        <Done report={step.report} onAgain={() => setStep({ kind: 'choose' })} />
      )}

      {askExisting && step.kind === 'preview' && (
        <ExistingDialog
          count={step.existing.size}
          onConfirm={(mode) => void start(mode)}
          onCancel={() => setAskExisting(false)}
        />
      )}
    </PageLayout>
  )
}

function Preview({
  step,
  onStart,
  onCancel,
}: {
  step: Extract<Step, { kind: 'preview' }>
  onStart: () => void
  onCancel: () => void
}) {
  const { plan, existing, fileName } = step
  const { stats } = plan
  const fresh = stats.total - existing.size
  const facts: [string, number][] = [
    ['Albums', stats.total],
    ['Possédés', stats.owned],
    ['Envies', stats.wanted],
    ['Lus', stats.read],
    ['Séries', stats.series],
    ['Éditions originales', stats.firstEditions],
    ['Dédicacés', stats.dedicated],
  ]

  return (
    <section className="flex max-w-2xl flex-col gap-4">
      <p className="text-slate-600">
        Fichier <strong>{fileName}</strong> : voici ce qui va être importé.
      </p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded border border-slate-200 p-2">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <ul className="flex flex-col gap-1 text-sm">
        <li>
          <strong>{fresh}</strong> nouvel{fresh > 1 ? 's' : ''} album{fresh > 1 ? 's' : ''} à
          ajouter
        </li>
        {existing.size > 0 && (
          <li>
            <strong>{existing.size}</strong> déjà dans votre collection (vous choisirez quoi en
            faire)
          </li>
        )}
        {stats.titlesToComplete > 0 && (
          <li>
            {stats.titlesToComplete} titre{stats.titlesToComplete > 1 ? 's' : ''} absent
            {stats.titlesToComplete > 1 ? 's' : ''} du fichier, recherché
            {stats.titlesToComplete > 1 ? 's' : ''} à la BnF
          </li>
        )}
      </ul>

      <IssueList title="Points d'attention (importés après correction)" issues={plan.warnings} />
      <IssueList title="Lignes qui ne seront pas importées" issues={plan.skipped} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={stats.total === 0}
          className="rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Importer {stats.total} album{stats.total > 1 ? 's' : ''}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-slate-300 px-4 py-2 font-medium"
        >
          Choisir un autre fichier
        </button>
      </div>
    </section>
  )
}

function IssueList({ title, issues }: { title: string; issues: ImportPlan['warnings'] }) {
  if (issues.length === 0) return null
  return (
    <details className="rounded border border-slate-200 p-2 text-sm">
      <summary className="cursor-pointer font-medium">
        {title} ({issues.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-1 text-slate-600">
        {issues.slice(0, MAX_ISSUES_SHOWN).map((issue, index) => (
          <li key={index}>
            Ligne {issue.line} : {issue.message}
          </li>
        ))}
        {issues.length > MAX_ISSUES_SHOWN && (
          <li>… et {issues.length - MAX_ISSUES_SHOWN} autres</li>
        )}
      </ul>
    </details>
  )
}

function Done({ report, onAgain }: { report: ImportReport; onAgain: () => void }) {
  const lines: [string, number][] = [
    ['albums ajoutés à votre collection', report.added],
    ['nouvelles éditions créées dans le catalogue', report.editionsCreated],
    ['titres retrouvés à la BnF', report.titlesCompleted],
    ['albums déjà présents complétés', report.updated],
    ['albums déjà présents laissés tels quels', report.skipped],
  ]
  return (
    <section className="flex max-w-lg flex-col gap-4">
      <FormMessage kind="success">Import terminé.</FormMessage>
      <ul className="flex flex-col gap-1">
        {lines.map(([label, value]) => (
          <li key={label}>
            <strong>{value}</strong> {label}
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-600">
        Les couvertures sont récupérées au fil de l'eau quand vous ouvrez « Ma collection » : cela
        peut prendre quelques minutes.
      </p>
      <div className="flex gap-2">
        <Link
          to="/collection"
          className="rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
        >
          Voir ma collection
        </Link>
        <button
          type="button"
          onClick={onAgain}
          className="rounded border border-slate-300 px-4 py-2 font-medium"
        >
          Importer un autre fichier
        </button>
      </div>
    </section>
  )
}
