//
let db;
const request = indexedDB.open("NatacionDB", 1);
let estilosPredeterminados = ["Crol", "Espalda", "Pecho", "Mariposa", "Técnica"];

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => console.log('Service Worker registrado', reg))
      .catch(err => console.error('Error al registrar el Service Worker', err));
  });
}

let deferredPrompt;

// --- 1. BLOQUE DE INSTALACIÓN (Líneas 14-39 aprox) ---
// Reemplaza el bloque 'beforeinstallprompt' por este más limpio:
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

// Al tocar cualquier parte de la app, si está lista para instalar, saltará el cartel
window.addEventListener('click', () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choice) => {
      if (choice.outcome === 'accepted') console.log('App Instalada');
      deferredPrompt = null;
    });
  }
});

function agregarInputEstilo() {
    const div = document.createElement("div");
    div.style = "display:flex; gap:10px; margin-bottom:10px; align-items:center;";
    div.innerHTML = `
        <input type="text" placeholder="Nuevo estilo..." class="nuevo-estilo-input" style="margin:0;">
        <button onclick="this.parentElement.remove()" class="btn-danger-sm">X</button>
    `;
    document.getElementById("lista-estilos-edit").appendChild(div);
}

function guardarConfigEstilos() {
    const inputs = document.querySelectorAll("#lista-estilos-edit input");
    const nuevosEstilos = Array.from(inputs).map(i => i.value).filter(v => v.trim() !== "");
    localStorage.setItem("misEstilos", JSON.stringify(nuevosEstilos));
    cerrarVistaSecundaria();
    alert("Estilos actualizados correctamente");
}

request.onupgradeneeded = (e) => {
    db = e.target.result;
    db.createObjectStore("sesiones", { keyPath: "id", autoIncrement: true }).createIndex("fecha", "fecha");
    db.createObjectStore("bloques", { keyPath: "id", autoIncrement: true }).createIndex("sesion_id", "sesion_id");
};

request.onsuccess = (e) => {
    db = e.target.result;
    actualizarDashboard(); 
    if(localStorage.getItem("theme") === "dark") document.body.classList.add("dark-mode");
};

// --- LOGICA DE VISTAS ---
function actualizarDashboard() {
    listarSesiones('lista-sesiones');
    obtenerDatosEstadisticas();
}

function cerrarVistaSecundaria() {
    document.getElementById("vista-secundaria").classList.add("hidden");
    actualizarDashboard();
}


// --- SESIONES ---
function listarSesiones(targetId) {
    const contenedor = document.getElementById(targetId);
    contenedor.innerHTML = "";

    const tx = db.transaction(["sesiones", "bloques"], "readonly");
    const storeSesiones = tx.objectStore("sesiones");
    const storeBloques = tx.objectStore("bloques");
    let sesiones = [];

    storeSesiones.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { sesiones.push(cursor.value); cursor.continue(); }
        else {
            sesiones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            sesiones.forEach(s => {
                const ritmo = s.duracion_total > 0 ? (s.distancia_total / s.duracion_total).toFixed(1) : 0;
                
                const divSesion = document.createElement("div");
                divSesion.className = "card-sesion";
                
                divSesion.innerHTML = `
                    <details ontoggle="if(this.open) cargarBloquesSesion(${s.id})">
                        <summary style="list-style:none; cursor:pointer;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <strong style="font-size:1.1em;">${formatearFecha(s.fecha)}</strong><br>
                                    <small style="color:var(--text-muted)">${s.distancia_total}m | ${s.duracion_total}min</small>
                                </div>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <span style="color:var(--primary); font-weight:bold; margin-right:5px;">${ritmo} <small style="font-weight:normal">m/min</small></span>
                                    <button class="btn-icon" onclick="prepararEdicionSesion(${s.id}, event)">✏️</button>
                                    <button class="btn-icon" onclick="borrarSesion(${s.id}, event)" style="color:var(--danger)">🗑️</button>
                                </div>
                            </div>
                        </summary>
                        <div id="bloques-sesion-${s.id}" style="padding:15px 0 0 0; font-size:0.9em; border-top:1px solid var(--border); margin-top:15px;">
                            <p style="color:var(--text-muted); margin-top:0;"><em>${s.notas || 'Sin notas'}</em></p>
                            <div class="lista-bloques-interna"></div>
                            <button class="btn-secondary" onclick="mostrarAgregarBloque(${s.id})" style="margin-top:15px; width:100%">+ Agregar Bloque</button>
                        </div>
                    </details>
                `;
                contenedor.appendChild(divSesion);
            });
        }
    };
}

// --- GESTIÓN DE BLOQUES ---
function guardarNuevoBloque(sesionId) {
    const estilo = document.getElementById("bloque-estilo").value;
    const distancia = parseInt(document.getElementById("bloque-distancia").value);
    const duracion = parseInt(document.getElementById("bloque-duracion").value);

    if (!estilo || isNaN(distancia) || isNaN(duracion)) {
        alert("Por favor, completa todos los campos correctamente.");
        return;
    }

    const tx = db.transaction(["bloques", "sesiones"], "readwrite");
    const storeBloques = tx.objectStore("bloques");
    const storeSesiones = tx.objectStore("sesiones");

    storeBloques.add({
        sesion_id: sesionId,
        estilo: estilo,
        distancia: distancia,
        duracion: duracion
    });

    storeSesiones.get(sesionId).onsuccess = (e) => {
        const sesion = e.target.result;
        sesion.distancia_total = (sesion.distancia_total || 0) + distancia;
        sesion.duracion_total = (sesion.duracion_total || 0) + duracion;
        storeSesiones.put(sesion);
    };

    tx.oncomplete = () => {
        console.log("Bloque guardado y sesión actualizada");
        cerrarVistaSecundaria(); 
    };
}


function cargarBloquesSesion(sesionId) {
    const contenedor = document.querySelector(`#bloques-sesion-${sesionId} .lista-bloques-interna`);
    contenedor.innerHTML = "<small>Cargando bloques...</small>";

    const tx = db.transaction(["bloques"], "readonly");
    const index = tx.objectStore("bloques").index("sesion_id");
    let html = "";

    index.openCursor(IDBKeyRange.only(sesionId)).onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const b = cursor.value;
            html += `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px dashed var(--border); align-items:center;">
                    <span><strong>${b.estilo}</strong>: ${b.distancia}m (${b.duracion}min)</span>
                    <button class="btn-icon" onclick="borrarBloque(${b.id}, ${sesionId})" style="color:var(--danger)">❌</button>
                </div>
            `;
            cursor.continue();
        } else {
            contenedor.innerHTML = html || "<p style='color:var(--text-muted)'>No hay bloques cargados.</p>";
        }
    };
}

function borrarBloque(bloqueId, sesionId) {
    if (!confirm("¿Borrar este bloque?")) return;

    const tx = db.transaction(["bloques", "sesiones"], "readwrite");
    const storeBloques = tx.objectStore("bloques");
    const storeSesiones = tx.objectStore("sesiones");

    storeBloques.get(bloqueId).onsuccess = (e) => {
        const bloque = e.target.result;
        storeSesiones.get(sesionId).onsuccess = (e2) => {
            const sesion = e2.target.result;
            sesion.distancia_total -= bloque.distancia;
            sesion.duracion_total -= bloque.duracion;
            storeSesiones.put(sesion);
            storeBloques.delete(bloqueId);
        };
    };

    tx.oncomplete = () => actualizarDashboard();
}

// --- EDICIÓN DE SESIÓN ---


function guardarEdicionSesion(id) {
    const nuevaFecha = document.getElementById("edit-fecha").value;
    const nuevasNotas = document.getElementById("edit-notas").value;

    const tx = db.transaction(["sesiones"], "readwrite");
    const store = tx.objectStore("sesiones");

    store.get(id).onsuccess = (e) => {
        const sesion = e.target.result;
        // CORRECCIÓN: Aplicamos la misma lógica de reemplazo de guiones
        sesion.fecha = new Date(nuevaFecha.replace(/-/g, '\/')).toISOString();
        sesion.notas = nuevasNotas;
        store.put(sesion);
    };

    tx.oncomplete = () => cerrarVistaSecundaria();
}

// --- ESTADISTICAS ---
function obtenerDatosEstadisticas() {
    const tx = db.transaction(["sesiones", "bloques"], "readonly");
    const sesionesStore = tx.objectStore("sesiones");
    const bloquesStore = tx.objectStore("bloques");

    let sesiones = [];
    let bloques = [];

    sesionesStore.getAll().onsuccess = (e) => {
        sesiones = e.target.result;
        bloquesStore.getAll().onsuccess = (e) => {
            bloques = e.target.result;
            procesarEstadisticasDashboard(sesiones, bloques);
        };
    };
}

function procesarEstadisticasDashboard(sesiones, bloques) {
    const contenedor = document.getElementById("resumen-stats");
    if (sesiones.length === 0) {
        contenedor.innerHTML = "<p style='color:var(--text-muted); text-align:center;'>Aún no hay sesiones registradas.</p>";
        return;
    }

    let distanciaTotal = 0;
    let tiempoTotal = 0;
    let mejorDistancia = { valor: 0, fecha: '' };
    let mejorRitmo = { valor: 0, fecha: '' };
    let porMes = {};

    sesiones.forEach(s => {
        const dist = s.distancia_total || 0;
        const tiempo = s.duracion_total || 0;
        distanciaTotal += dist;
        tiempoTotal += tiempo;

        if (dist > mejorDistancia.valor) { mejorDistancia = { valor: dist, fecha: s.fecha }; }
        if (tiempo > 0) {
            const ritmoSesion = dist / tiempo;
            if (ritmoSesion > mejorRitmo.valor) { mejorRitmo = { valor: ritmoSesion, fecha: s.fecha }; }
        }

        const fechaObj = new Date(s.fecha);
        const claveMes = `${fechaObj.getFullYear()}-${fechaObj.getMonth() + 1}`;
        if (!porMes[claveMes]) {
            porMes[claveMes] = { 
                nombre: fechaObj.toLocaleString('es-ES', { month: 'long', year: 'numeric' }), 
                distancia: 0, sesiones: 0, tiempo: 0 
            };
        }
        porMes[claveMes].distancia += dist;
        porMes[claveMes].sesiones += 1;
        porMes[claveMes].tiempo += tiempo;
    });

    const ritmoMedio = tiempoTotal > 0 ? (distanciaTotal / tiempoTotal).toFixed(1) : 0;

    contenedor.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; text-align: center; margin-bottom: 20px; padding: 10px 0; border-bottom: 1px solid var(--border);">
            <div class="stat-item">
                <small>SESIONES</small>
                <div style="font-size: 1.1em; font-weight: bold; color: var(--primary);">${sesiones.length}</div>
            </div>
            <div class="stat-item">
                <small>METROS</small>
                <div style="font-size: 1.1em; font-weight: bold; color: var(--primary);">${distanciaTotal}m</div>
            </div>
            <div class="stat-item">
                <small>TIEMPO</small>
                <div style="font-size: 1.1em; font-weight: bold; color: var(--primary);">${tiempoTotal} min</div>
            </div>
            <div class="stat-item">
                <small>RITMO</small>
                <div style="font-size: 1.1em; font-weight: bold; color: var(--primary);">${ritmoMedio} m/min</div>
            </div>
        </div>

        <div style="background: rgba(10, 132, 255, 0.08); border-radius: 10px; padding: 12px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-around; text-align: center;">
                <div>
                    <small style="color: var(--primary); font-weight: bold;">🏆 MAX DISTANCIA</small>
                    <div style="font-size: 1.1em; font-weight: bold;">${mejorDistancia.valor}m</div>
                    <small style="font-size: 0.75em; color: var(--text-muted);">${formatearFecha(mejorDistancia.fecha)}</small>
                </div>
                <div style="border-left: 1px solid rgba(0,0,0,0.1); padding-left: 10px;">
                    <small style="color: var(--primary); font-weight: bold;">⚡ MEJOR RITMO</small>
                    <div style="font-size: 1.1em; font-weight: bold;">${mejorRitmo.valor.toFixed(1)} m/min</div>
                    <small style="font-size: 0.75em; color: var(--text-muted);">${formatearFecha(mejorRitmo.fecha)}</small>
                </div>
            </div>
        </div>

        <div style="border-top: 1px solid var(--border); padding-top: 15px;">
            <small style="font-weight: bold; display: block; margin-bottom: 10px;">HISTORIAL MENSUAL</small>
            <div id="tabla-mes-container">
                <table style="width: 100%; font-size: 0.9em; text-align: left; border-collapse: collapse;">
                    <thead>
                        <tr style="color: var(--text-muted); border-bottom: 1px solid var(--border);">
                            <th style="padding: 5px 0;">Mes</th>
                            <th>Ses.</th>
                            <th>Dist.</th>
                            <th>Ritmo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.keys(porMes).map(clave => {
                            const m = porMes[clave];
                            const ritmoMes = m.tiempo > 0 ? (m.distancia / m.tiempo).toFixed(1) : 0;
                            return `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 10px 0; text-transform: capitalize; font-weight: bold;">${m.nombre}</td>
                                    <td style="color: var(--text-muted);">${m.sesiones}</td>
                                    <td style="color: var(--text-muted);">${m.distancia}m</td>
                                    <td style="color: var(--text-muted); font-weight:bold;">${ritmoMes} <small style="font-weight:normal">m/min</small></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function generarTablaMesHTML(datosMes, filtro = "todos") {
    let html = `<table style="width: 100%; font-size: 0.85em; text-align: left; border-collapse: collapse;">
        <thead>
            <tr style="color: #888; border-bottom: 1px solid #eee;">
                <th style="padding: 5px 0;">Mes</th>
                <th>Sesiones</th>
                <th>Total Dist.</th>
            </tr>
        </thead>
        <tbody>`;
    Object.keys(datosMes).forEach(clave => {
        if (filtro === "todos" || filtro === clave) {
            const m = datosMes[clave];
            html += `<tr style="border-bottom: 1px solid #f9f9f9;">
                <td style="padding: 8px 0; text-transform: capitalize;">${m.nombre}</td>
                <td>${m.sesiones}</td>
                <td><strong>${m.distancia}m</strong></td>
            </tr>`;
        }
    });
    html += `</tbody></table>`;
    return html;
}

function filtrarTablaMes(valor) {
    obtenerDatosEstadisticas(); 
}

// --- UTILIDADES ---
// --- VISTAS DE INFORMACIÓN (Sin botones redundantes) ---
// 1. EDITAR ESTILOS (Configuración)
function configurarEstilos() {
    // Solo cierra el menú si la clase 'active' está presente (evita el rebote al borrar)
    const menu = document.getElementById("sideMenu");
    if (menu.classList.contains("active")) {
        toggleMenu();
    }

    const estilos = JSON.parse(localStorage.getItem("misEstilos")) || estilosPredeterminados;
    const vista = document.getElementById("vista-secundaria");
    const cont = document.getElementById("contenido-secundario");
    
    vista.classList.remove("hidden");
    cont.innerHTML = `
        <div class="cuadro-dashboard" style="margin: 15px;">
            <h2 style="margin-top:0;">Mis Estilos</h2>
            <div id="lista-estilos-edit" style="margin-bottom: 20px;">
                ${estilos.map((e, i) => `
                    <div style="display:flex; gap:10px; margin-bottom:10px; align-items:center;">
                        <input type="text" value="${e}" 
                               onchange="actualizarEstiloIndividual(${i}, this.value)" 
                               style="margin:0; flex-grow: 1;">
                        <button onclick="eliminarEstilo(${i})" 
                                class="btn-danger-sm" 
                                style="width:45px; height:45px; flex-shrink:0;">✕</button>
                    </div>
                `).join('')}
            </div>
            <button onclick="agregarInputEstilo()" class="btn-secondary" style="width:100%; margin-bottom:15px;">+ Nuevo Estilo</button>
            <button onclick="guardarConfigEstilos()" class="btn-primary" style="width:100%;">💾 Guardar Cambios</button>
            <button onclick="cerrarVistaSecundaria()" class="btn-cancelar">Cancelar</button>
        </div>
    `;
}

// Asegúrate de tener estas funciones de apoyo:
function eliminarEstilo(index) {
    let estilos = JSON.parse(localStorage.getItem("misEstilos")) || estilosPredeterminados;
    estilos.splice(index, 1);
    localStorage.setItem("misEstilos", JSON.stringify(estilos));
    configurarEstilos(); // Refresca la vista
}

function actualizarEstiloIndividual(index, nuevoValor) {
    let estilos = JSON.parse(localStorage.getItem("misEstilos")) || estilosPredeterminados;
    estilos[index] = nuevoValor;
    localStorage.setItem("misEstilos", JSON.stringify(estilos));
}

// 2. AGREGAR SESIÓN
function mostrarSeccion(tipo) {
    if (tipo === 'crear') {
        const cont = document.getElementById("contenido-secundario");
        document.getElementById("vista-secundaria").classList.remove("hidden");
        cont.innerHTML = `
            <div class="cuadro-dashboard" style="margin: 15px;">
                <h2 style="margin-top:0;">Nueva Sesión</h2>
                <input type="date" id="fecha" value="${new Date().toISOString().split("T")[0]}">
                <input type="text" id="notas" placeholder="Notas">
                <button onclick="crearSesion()" class="btn-primary" style="width:100%;">Guardar Sesión</button>
                <button onclick="cerrarVistaSecundaria()" class="btn-cancelar">Cancelar</button>
            </div>
        `;
    }
}

// 3. EDITAR SESIÓN
function prepararEdicionSesion(id, event) {
    event.stopPropagation();
    const tx = db.transaction(["sesiones"], "readonly");
    tx.objectStore("sesiones").get(id).onsuccess = (e) => {
        const s = e.target.result;
        const cont = document.getElementById("contenido-secundario");
        document.getElementById("vista-secundaria").classList.remove("hidden");
        cont.innerHTML = `
            <div class="cuadro-dashboard" style="margin: 15px;">
                <h2 style="margin-top:0;">Editar Sesión</h2>
                <input type="date" id="edit-fecha" value="${s.fecha.split('T')[0]}">
                <input type="text" placeholder="Notas" id="edit-notas" value="${s.notas || ''}">
                <button class="btn-primary" onclick="guardarEdicionSesion(${id})" style="width:100%;">Guardar Cambios</button>
                <button class="btn-cancelar" onclick="cerrarVistaSecundaria()">Cancelar</button>
            </div>
        `;
    };
}

// 4. QR (Ahora con botón Cancelar y sin "Volver")
function mostrarQR() {
    // Cerramos el menú si está abierto
    const menu = document.getElementById("sideMenu");
    if (menu && menu.classList.contains("active")) {
        toggleMenu();
    }

    const vista = document.getElementById("vista-secundaria");
    const cont = document.getElementById("contenido-secundario");
    
    vista.classList.remove("hidden");
    cont.innerHTML = `
        <div class="cuadro-dashboard" style="text-align:center; margin: 15px; padding: 30px 20px;">
            <h2 style="margin-top:0; color:var(--primary);">QR de Acceso</h2>

            
            <div class="qr-container">
                <img src="mi-qr.png" alt="QR de Acceso" class="qr-img">
            </div>


            <button onclick="cerrarVistaSecundaria()" class="btn-cancelar" style="margin-top:20px;">Cancelar</button>
        </div>
    `;
}

// 5. HORARIOS (Ahora con botón Cancelar y sin "Volver")
function mostrarHorarios() {
    const cont = document.getElementById("contenido-secundario");
    document.getElementById("vista-secundaria").classList.remove("hidden");
    cont.innerHTML = `
        <div class="cuadro-dashboard" style="margin: 15px; margin-top:40px;">
            <h2 style="margin-top:0;">Horarios de Pileta</h2>
            <p><strong>Lun a Vie:</strong> 07:00 - 22:00</p>
            <p><strong>Sábados:</strong> 08:00 - 14:00</p>
            <button class="btn-cancelar" onclick="cerrarVistaSecundaria()" style="margin-top:20px;">Cancelar</button>
        </div>
    `;
}

// --- FORMULARIOS (Con botón Cancelar único) ---


function mostrarAgregarBloque(sesionId) {
    const vista = document.getElementById("vista-secundaria");
    const cont = document.getElementById("contenido-secundario");
    vista.classList.remove("hidden");
    cont.innerHTML = `
        <div class="cuadro-dashboard" style="margin: 15px;">
            <h2 style="margin-top:0;">Nuevo Bloque</h2>
            <label>Estilo:</label>
            <input type="text" id="bloque-estilo" list="estilos-sugeridos">
            <datalist id="estilos-sugeridos">
                ${(JSON.parse(localStorage.getItem("misEstilos")) || estilosPredeterminados).map(e => `<option value="${e}">`).join('')}
            </datalist>
            <label>Distancia (m):</label>
            <input type="number" id="bloque-distancia" >
            <label>Duración (min):</label>
            <input type="number" id="bloque-duracion" >
            <button class="btn-primary" onclick="guardarNuevoBloque(${sesionId})" style="width:100%; margin-top:10px;">💾 Guardar Bloque</button>
            <button class="btn-secondary" onclick="cerrarVistaSecundaria()" style="width:100%; margin-top:10px; border:none; color:var(--text-muted);">Cancelar</button>
        </div>
    `;
}

function toggleMenu() { document.getElementById("sideMenu").classList.toggle("active"); }

function toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("theme", document.body.classList.contains("dark-mode") ? "dark" : "light");
}

function formatearFecha(f) {
    const d = new Date(f);
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
}

// --- 2. CREAR SESIÓN (Corrección de fecha) ---
function crearSesion() {
    const f = document.getElementById("fecha").value; // Viene como "YYYY-MM-DD"
    const n = document.getElementById("notas").value;
    
    // CORRECCIÓN: Usar barras '/' en lugar de guiones '-' para forzar hora local
    const fechaLocal = new Date(f.replace(/-/g, '\/')).toISOString();

    const tx = db.transaction(["sesiones"], "readwrite");
    tx.objectStore("sesiones").add({ 
        fecha: fechaLocal, 
        notas: n, 
        distancia_total: 0, 
        duracion_total: 0 
    });
    tx.oncomplete = () => cerrarVistaSecundaria();
}

function borrarSesion(id, event) {
    if(event) event.stopPropagation(); // Evitar que se cierre/abra el details
    if (!confirm("¿Borrar?")) return;
    const tx = db.transaction(["sesiones"], "readwrite");
    tx.objectStore("sesiones").delete(id);
    tx.oncomplete = () => actualizarDashboard();
}

function importarDatos() {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = e => {
        const reader = new FileReader();
        reader.readAsText(e.target.files[0]);
        reader.onload = res => {
            const data = JSON.parse(res.target.result);
            const tx = db.transaction(["sesiones", "bloques"], "readwrite");
            data.sesiones.forEach(s => tx.objectStore("sesiones").put(s));
            data.bloques.forEach(b => tx.objectStore("bloques").put(b));
            tx.oncomplete = () => location.reload();
        };
    };
    input.click();
}

function exportarDatos() {
    const tx = db.transaction(["sesiones", "bloques"], "readonly");
    const data = {};
    tx.objectStore("sesiones").getAll().onsuccess = (e) => {
        data.sesiones = e.target.result;
        tx.objectStore("bloques").getAll().onsuccess = (e) => {
            data.bloques = e.target.result;
            const blob = new Blob([JSON.stringify(data)], {type: "application/json"});
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "backup_natacion.json";
            a.click();
        };
    };

}

