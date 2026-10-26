// Compras Offiesco: almacenamiento y copias independientes de InventarioPhone.
const DB_NAME = 'compras-offiesco-db';
const DB_VERSION = 1;
const STORE_NAME = 'productos';
const BACKUP_FORMAT = 'compras-offiesco';
const BACKUP_VERSION = 1;
const $ = selector => document.querySelector(selector);
const form = $('#product-form'), referenceInput = $('#product-reference'), quantityInput = $('#product-quantity');
const searchInput = $('#search-input'), list = $('#product-list'), emptyState = $('#empty-state'), editDialog = $('#edit-dialog'), importDialog = $('#import-dialog'), stockDialog = $('#stock-dialog');
let db, products = [], noticeTimer, pendingImport;
let speechRecognition, speechActive = false, speechCancelled = false, speechTarget;
const speechTargets = {
  reference: { input: referenceInput, button: $('#voice-button'), status: $('#voice-status'), label: 'referencia' },
  quantity: { input: quantityInput, button: $('#quantity-voice-button'), status: $('#quantity-voice-status'), label: 'cantidad' },
  search: { input: searchInput, button: $('#search-voice-button'), status: $('#search-voice-status'), label: 'búsqueda' }
};

function normalizeText(value) { return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es'); }
function cleanReference(value) { return String(value ?? '').trim().replace(/\s+/g, ' ').replace(/\b(?:[A-Za-z0-9] ){2,}[A-Za-z0-9]\b/g, token => token.replace(/\s/g, '')); }
function referenceKey(value) { return normalizeText(value); }
function validInteger(value, minimum = 0) { const text = String(value); if (!/^\d+$/.test(text)) return null; const number = Number(text); return Number.isSafeInteger(number) && number >= minimum ? number : null; }
function withReferenceKey(product) { const record = { ...product, referenceKey: referenceKey(product.reference) }; delete record.nameKey; delete record.barcodeKey; delete record.barcode; delete record.name; delete record.previousPurchaseQuantity; return record; }
function showNotice(message, isError = false) { clearTimeout(noticeTimer); $('#notice').textContent = message; $('#notice').classList.toggle('error', isError); $('#notice').hidden = false; noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 4500); }

function setVoiceStatus(target, message, isError = false) { target.status.textContent = message; target.status.classList.toggle('error-text', isError); target.status.hidden = !message; }
function setVoiceButtonState(target, active) { target.button.setAttribute('aria-pressed', String(active)); target.button.setAttribute('aria-label', active ? `Detener dictado de ${target.label}` : `Dictar ${target.label}`); const label = target.button.querySelector('span:not([aria-hidden="true"])'); if (label) label.textContent = active ? 'Detener' : 'Dictar'; }
function stopVoiceRecognition(cancel = false) { if (!speechRecognition) return; speechCancelled = cancel; if (cancel) speechRecognition.abort(); else speechRecognition.stop(); if (speechTarget) setVoiceStatus(speechTarget, cancel ? 'Dictado cancelado.' : 'Finalizando el dictado…'); }
function startVoiceRecognition(target) {
  if (speechRecognition) { setVoiceStatus(target, 'Ya hay otro dictado activo. Espera a que termine.', true); return; }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { setVoiceStatus(target, 'Este navegador no admite dictado por voz. Puedes escribir manualmente.', true); return; }
  if (!window.isSecureContext) { setVoiceStatus(target, 'El dictado requiere HTTPS o localhost.', true); return; }
  speechRecognition = new Recognition(); speechTarget = target; speechRecognition.lang = 'es-CO'; speechRecognition.continuous = false; speechRecognition.interimResults = false; speechCancelled = false;
  speechRecognition.onstart = () => { speechActive = true; setVoiceButtonState(target, true); setVoiceStatus(target, 'Escuchando… Habla ahora.'); };
  speechRecognition.onresult = event => {
    if (speechCancelled) return;
    const transcript = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(' ').trim();
    if (!transcript) { setVoiceStatus(target, 'No se reconoció texto. Inténtalo de nuevo.', true); return; }
    if (target === speechTargets.quantity) { target.input.value = spokenQuantity(transcript); }
    else target.input.value = cleanReference(transcript);
    target.input.dispatchEvent(new Event('input', { bubbles: true }));
    setVoiceStatus(target, `${target.label === 'búsqueda' ? 'Búsqueda' : target.label === 'cantidad' ? 'Cantidad' : 'Referencia'} reconocida: ${target.input.value}`);
  };
  speechRecognition.onerror = event => setVoiceStatus(target, ({ 'not-allowed': 'No se concedió permiso para usar el micrófono.', 'no-speech': 'No se detectó voz. Inténtalo de nuevo.', network: 'Falló la conexión necesaria para reconocer la voz.', aborted: speechCancelled ? 'Dictado cancelado.' : 'El dictado se detuvo.' })[event.error] || 'Ocurrió un error al reconocer la voz.', true);
  speechRecognition.onend = () => { speechActive = false; setVoiceButtonState(target, false); speechRecognition = undefined; speechTarget = undefined; };
  setVoiceStatus(target, 'Solicitando acceso al micrófono…');
  try { speechRecognition.start(); } catch { speechRecognition = undefined; speechTarget = undefined; setVoiceStatus(target, 'No se pudo iniciar el dictado. Inténtalo de nuevo.', true); }
}
function spokenQuantity(transcript) {
  const digitMatch = transcript.trim().match(/^\d+$/);
  if (digitMatch) return digitMatch[0];
  const words = { cero: 0, zero: 0, uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, dieciséis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintiún: 21, veintidos: 22, veintidós: 22, veintitres: 23, veintitrés: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintiséis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100 };
  const normalized = transcript.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\bveintiun\b/g, 'veintiuno');
  const exact = words[normalized.trim()];
  if (exact !== undefined) return String(exact);
  const parts = normalized.trim().split(/\s+/);
  if (parts.length === 2 && parts[1] in words && words[parts[0]] >= 30 && words[parts[0]] < 100 && words[parts[1]] < 10) return String(words[parts[0]] + words[parts[1]]);
  return '';
}
Object.values(speechTargets).forEach(target => target.button.addEventListener('click', () => speechTarget === target && speechActive ? stopVoiceRecognition() : startVoiceRecognition(target)));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && speechRecognition) stopVoiceRecognition(true); });

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('Este navegador no permite guardar datos locales.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true }); store.createIndex('referenceKey', 'referenceKey', { unique: true }); };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la base de datos.'));
  });
}
function storeRequest(mode, action) { return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, mode); const request = action(tx.objectStore(STORE_NAME)); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error('No se pudo guardar el cambio.')); tx.onabort = () => reject(tx.error || new Error('El cambio no se completó.')); }); }
async function loadProducts() { products = await storeRequest('readonly', store => store.getAll()); products.sort((a, b) => a.reference.localeCompare(b.reference, 'es', { sensitivity: 'base' })); render(); }

function downloadFile(content, type, extension) {
  const now = new Date(), pad = value => String(value).padStart(2, '0');
  const stamp = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = `compras_offiesco_${stamp}.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvCell(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
$('#export-csv').addEventListener('click', () => { const rows = [['Referencia del producto', 'Cantidad'], ...products.map(product => [product.reference, product.quantity])]; downloadFile(`\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`, 'text/csv;charset=utf-8', 'csv'); showNotice('Inventario exportado en CSV.'); });
$('#export-json').addEventListener('click', () => { const backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, app: 'Compras Offiesco', exportedAt: new Date().toISOString(), products: products.map(({ reference, quantity }) => ({ reference, quantity })) }; downloadFile(`\uFEFF${JSON.stringify(backup, null, 2)}`, 'application/json;charset=utf-8', 'json'); showNotice('Copia completa exportada en JSON.'); });

function validateBackup(backup) {
  const errors = [];
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) return { errors: ['El archivo debe contener un objeto JSON de copia.'] };
  const legacy = backup.format === 'inventario-local';
  if ((!legacy && backup.format !== BACKUP_FORMAT) || (legacy && ![1, 2].includes(backup.version))) errors.push('Formato o versión no reconocidos.');
  if (!legacy && (backup.version !== BACKUP_VERSION || backup.app !== 'Compras Offiesco')) errors.push('La versión o aplicación de la copia no es compatible.');
  if (typeof backup.exportedAt !== 'string' || Number.isNaN(Date.parse(backup.exportedAt))) errors.push('La copia no contiene una fecha válida.');
  if (!Array.isArray(backup.products)) errors.push('La copia debe contener una lista de productos.');
  if (errors.length) return { errors };
  const refs = new Set(), normalized = [];
  backup.products.forEach((product, i) => {
    const oldName = legacy && typeof product?.name === 'string' ? product.name : '';
    const rawReference = legacy ? (product?.reference ?? product?.barcode ?? oldName) : product?.reference;
    const reference = cleanReference(rawReference), quantity = product?.quantity;
    if (!reference) errors.push(`Producto ${i + 1}: referencia vacía o inválida.`);
    if (!Number.isSafeInteger(quantity) || quantity < 0) errors.push(`Producto ${i + 1}: la cantidad debe ser un entero no negativo.`);
    const key = referenceKey(reference);
    if (key && refs.has(key)) errors.push(`Producto ${i + 1}: la referencia "${reference}" está duplicada.`);
    refs.add(key);
    if (reference && Number.isSafeInteger(quantity) && quantity >= 0) normalized.push({ reference, quantity });
  });
  return { errors, products: normalized };
}
function getImportConflicts(incoming) { const refs = new Set(products.map(product => referenceKey(product.reference))); return incoming.filter(product => refs.has(referenceKey(product.reference))).map(product => `La referencia "${product.reference}" ya existe.`); }
$('#import-json').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  let validation; try { validation = validateBackup(JSON.parse((await file.text()).replace(/^\uFEFF/, ''))); } catch { validation = { errors: ['No se pudo leer el archivo JSON.'] }; }
  pendingImport = validation.errors.length ? null : validation.products;
  $('#import-summary').textContent = pendingImport ? `Copia válida: ${pendingImport.length} productos.` : 'La copia no es válida; no se importará.';
  const errorsBox = $('#import-errors'); errorsBox.hidden = !validation.errors.length; errorsBox.replaceChildren(...validation.errors.map(message => { const line = document.createElement('div'); line.textContent = message; return line; }));
  $('#apply-import').disabled = !pendingImport; $('input[name="import-mode"][value="replace"]').checked = true; importDialog.showModal();
});
document.querySelectorAll('input[name="import-mode"]').forEach(input => input.addEventListener('change', () => { $('#import-mode-help').textContent = input.value === 'replace' ? 'Reemplaza los productos actuales; se pedirá confirmación.' : 'Agrega productos si sus referencias no existen ya.'; }));
function commitImport(mode, incoming) { return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, 'readwrite'), store = tx.objectStore(STORE_NAME); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('La transacción se canceló.')); tx.onerror = () => reject(tx.error || new Error('No se pudo completar la importación.')); if (mode === 'replace') store.clear(); incoming.forEach(product => store.add(withReferenceKey({ ...product, createdAt: Date.now() }))); }); }
$('#apply-import').addEventListener('click', async () => {
  if (!pendingImport) return; const mode = $('input[name="import-mode"]:checked').value;
  if (mode === 'replace' && !confirm(`Se reemplazarán ${products.length} productos por ${pendingImport.length} de la copia. ¿Continuar?`)) return;
  const conflicts = mode === 'add' ? getImportConflicts(pendingImport) : [];
  if (conflicts.length) { const box = $('#import-errors'); box.hidden = false; box.replaceChildren(...conflicts.map(message => { const line = document.createElement('div'); line.textContent = message; return line; })); return; }
  try { await commitImport(mode, pendingImport); importDialog.close(); await loadProducts(); showNotice('Copia importada correctamente.'); } catch (error) { showNotice(`La importación falló: ${error.message}`, true); }
});

function render() {
  const query = normalizeText(searchInput.value), filtered = products.filter(product => normalizeText(product.reference).includes(query));
  $('#product-count').textContent = products.length; $('#unit-count').textContent = products.reduce((sum, product) => sum + product.quantity, 0).toLocaleString('es'); $('#visible-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'producto' : 'productos'}`; list.replaceChildren();
  filtered.forEach(product => {
    const row = document.createElement('tr'), refCell = document.createElement('td'); refCell.textContent = product.reference;
    const quantityCell = document.createElement('td'), pill = document.createElement('span'); pill.className = `quantity-pill${product.quantity <= 3 ? ' low' : ''}`; pill.textContent = product.quantity.toLocaleString('es'); quantityCell.append(pill);
    const actionsCell = document.createElement('td'), actions = document.createElement('div'); actions.className = 'row-actions';
    [['+ Sumar', 'stock', 'add-action'], ['Editar', 'edit', ''], ['Eliminar', 'delete', 'delete-action']].forEach(([label, action, klass]) => { const button = document.createElement('button'); button.type = 'button'; button.className = `text-action ${klass}`; button.dataset.action = action; button.dataset.id = product.id; button.textContent = label; button.setAttribute('aria-label', `${label} ${product.reference}`); actions.append(button); });
    actionsCell.append(actions); row.append(refCell, quantityCell, actionsCell); list.append(row);
  });
  const noProducts = products.length === 0; emptyState.hidden = filtered.length > 0; $('#empty-title').textContent = noProducts ? 'Aún no hay productos' : 'No encontramos coincidencias'; $('#empty-description').textContent = noProducts ? 'Agrega tu primer producto para comenzar.' : 'Prueba con otra referencia.';
}
function hasDuplicateReference(reference, ignoredId = null) { const key = referenceKey(reference); return products.some(product => product.id !== ignoredId && referenceKey(product.reference) === key); }
function showSaveError(error) { showNotice(error?.name === 'ConstraintError' ? 'Esa referencia ya está registrada.' : error.message || 'No se pudo guardar el cambio.', true); }
form.addEventListener('submit', async event => {
  event.preventDefault(); const reference = cleanReference(referenceInput.value), quantity = validInteger(quantityInput.value);
  if (!reference) return showNotice('Escribe la referencia del producto.', true); if (quantity === null) return showNotice('La cantidad debe ser un entero igual o mayor que cero.', true); if (hasDuplicateReference(reference)) return showNotice('Esa referencia ya está registrada.', true);
  try { await storeRequest('readwrite', store => store.add(withReferenceKey({ reference, quantity, createdAt: Date.now() }))); await loadProducts(); form.reset(); quantityInput.value = '0'; referenceInput.focus(); showNotice('Producto guardado correctamente.'); } catch (error) { showSaveError(error); }
});
searchInput.addEventListener('input', render);
list.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]'); if (!button) return; const product = products.find(item => String(item.id) === button.dataset.id); if (!product) return;
  if (button.dataset.action === 'edit') { $('#edit-id').value = product.id; $('#edit-reference').value = product.reference; $('#edit-quantity').value = product.quantity; editDialog.showModal(); $('#edit-reference').focus(); }
  if (button.dataset.action === 'stock') { $('#stock-id').value = product.id; $('#stock-product-name').textContent = product.reference; $('#stock-amount').value = '1'; stockDialog.showModal(); $('#stock-amount').focus(); }
  if (button.dataset.action === 'delete') { if (!confirm(`¿Eliminar “${product.reference}” del inventario? Esta acción no se puede deshacer.`)) return; try { await storeRequest('readwrite', store => store.delete(product.id)); await loadProducts(); showNotice('Producto eliminado.'); } catch (error) { showSaveError(error); } }
});
$('#edit-form').addEventListener('submit', async event => {
  event.preventDefault(); const id = Number($('#edit-id').value), reference = cleanReference($('#edit-reference').value), quantity = validInteger($('#edit-quantity').value), product = products.find(item => item.id === id);
  if (!product) return showNotice('No encontramos ese producto.', true); if (!reference) return showNotice('Escribe la referencia del producto.', true); if (quantity === null) return showNotice('La cantidad debe ser un entero igual o mayor que cero.', true); if (hasDuplicateReference(reference, id)) return showNotice('Esa referencia ya está registrada.', true);
  try { await storeRequest('readwrite', store => store.put(withReferenceKey({ ...product, reference, quantity }))); editDialog.close(); await loadProducts(); showNotice('Cambios guardados correctamente.'); } catch (error) { showSaveError(error); }
});
$('#stock-form').addEventListener('submit', async event => {
  event.preventDefault(); const id = Number($('#stock-id').value), amount = validInteger($('#stock-amount').value, 1), product = products.find(item => item.id === id);
  if (!product) return showNotice('No encontramos ese producto.', true); if (amount === null) return showNotice('Escribe un entero mayor que cero.', true); if (!Number.isSafeInteger(product.quantity + amount)) return showNotice('La cantidad total supera el límite permitido.', true);
  try { await storeRequest('readwrite', store => store.put({ ...product, quantity: product.quantity + amount })); stockDialog.close(); await loadProducts(); showNotice(`Se sumaron ${amount} ${amount === 1 ? 'unidad' : 'unidades'}.`); } catch (error) { showSaveError(error); }
});
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
for (const input of [quantityInput, $('#edit-quantity'), $('#stock-amount')]) input.addEventListener('input', () => { if (!/^\d*$/.test(input.value)) input.value = ''; });
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.focus(); } });
async function startApp() { try { db = await openDatabase(); await loadProducts(); } catch (error) { showNotice(`${error.message} Prueba en localhost.`, true); form.querySelector('button[type="submit"]').disabled = true; } if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) navigator.serviceWorker.register('./service-worker.js').catch(() => showNotice('No se pudo activar el modo sin conexión.', true)); }
startApp();
