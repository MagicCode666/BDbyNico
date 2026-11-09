/** Fait télécharger un texte par le navigateur, sous le nom donné. */
export function downloadText(fileName: string, text: string, mimeType = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
