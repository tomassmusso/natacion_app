let db;

// Abrir base de datos
const request = indexedDB.open("NatacionDB", 1);

request.onupgradeneeded = function (event) {
    db = event.target.result;

    // Tabla sesiones
    const sesionesStore = db.createObjectStore("sesiones", {
        keyPath: "id",
        autoIncrement: true
    });

    sesionesStore.createIndex("fecha", "fecha", { unique: false });

    // Tabla bloques
    const bloquesStore = db.createObjectStore("bloques", {
        keyPath: "id",
        autoIncrement: true
    });

    bloquesStore.createIndex("sesion_id", "sesion_id", { unique: false });
};

request.onsuccess = function (event) {
    db = event.target.result;
    console.log("Base de datos lista");
};

request.onerror = function () {
    console.log("Error al abrir la base");
};

function formatearFecha(fechaISO) {
    const fecha = new Date(fechaISO);
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const anio = fecha.getFullYear();

    return `${dia}/${mes}/${anio}`;
}

function mostrarSeccion(seccion) {
    const contenido = document.getElementById("contenido");

    if (seccion === "crear") {
    const hoy = new Date().toISOString().split("T")[0];

    contenido.innerHTML = `
        <h2>Nueva Sesión</h2>
        <label>Fecha:</label><br>
        <input type="date" id="fecha" value="${hoy}"><br><br>
        <label>Notas:</label><br>
        <input type="text" id="notas" placeholder="Opcional"><br><br>
        <button onclick="crearSesion()">Crear sesión</button>
        `;
    }

    if (seccion === "sesiones") {
        listarSesiones();
    }

    if (seccion === "estadisticas") {
        mostrarEstadisticas();
    }
}

function crearSesion() {
    const fechaInput = document.getElementById("fecha").value;
    const notas = document.getElementById("notas").value;

    if (!fechaInput) {
        alert("Elegí una fecha");
        return;
    }

    const fechaISO = new Date(fechaInput).toISOString();

    const transaction = db.transaction(["sesiones"], "readwrite");
    const store = transaction.objectStore("sesiones");

    store.add({
        fecha: fechaISO,
        notas: notas,
        distancia_total: 0,
        duracion_total: 0
    });

    transaction.oncomplete = function () {
        alert("Sesión creada");
        listarSesiones();
    };
}

function listarSesiones() {
    const contenido = document.getElementById("contenido");
    contenido.innerHTML = "<h2>Sesiones</h2>";

    const transaction = db.transaction(["sesiones"], "readonly");
    const store = transaction.objectStore("sesiones");

    let sesiones = [];

    store.openCursor().onsuccess = function (event) {
        const cursor = event.target.result;

        if (cursor) {
            sesiones.push(cursor.value);
            cursor.continue();
        } else {
            // Ordenar por fecha ascendente (más vieja primero)
            sesiones.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

            sesiones.forEach(sesion => {
                contenido.innerHTML += `
                    <div class="card">
                        <strong>${formatearFecha(sesion.fecha)}</strong><br>
                        Distancia: ${sesion.distancia_total} m<br>
                        Duración: ${sesion.duracion_total} min<br><br>
                        <button onclick="mostrarAgregarBloque(${sesion.id})">Agregar bloque</button>
                    </div>
                `;
            });
        }
    };
}

function mostrarAgregarBloque(sesionId) {
    const contenido = document.getElementById("contenido");

    contenido.innerHTML = `
        <h2>Agregar Bloque</h2>
        <input type="text" id="estilo" placeholder="Estilo"><br><br>
        <input type="number" id="distancia" placeholder="Distancia (m)"><br><br>
        <input type="number" id="duracion" placeholder="Duración (min)"><br><br>
        <button onclick="agregarBloque(${sesionId})">Guardar</button>
    `;
}

function agregarBloque(sesionId) {
    const estilo = document.getElementById("estilo").value;
    const distancia = parseInt(document.getElementById("distancia").value);
    const duracion = parseInt(document.getElementById("duracion").value);

    const transaction = db.transaction(["bloques", "sesiones"], "readwrite");
    const bloquesStore = transaction.objectStore("bloques");
    const sesionesStore = transaction.objectStore("sesiones");

    // Agregar bloque
    bloquesStore.add({
        sesion_id: sesionId,
        estilo: estilo,
        distancia: distancia,
        duracion: duracion
    });

    // Actualizar totales en sesión
    const request = sesionesStore.get(sesionId);

    request.onsuccess = function () {
        const sesion = request.result;

        sesion.distancia_total += distancia;
        sesion.duracion_total += duracion;

        sesionesStore.put(sesion);
    };

    transaction.oncomplete = function () {
        alert("Bloque agregado");
        listarSesiones();
    };
}

function mostrarEstadisticas() {
    const contenido = document.getElementById("contenido");
    contenido.innerHTML = "<h2>Estadísticas</h2>";

    const transaction = db.transaction(["sesiones", "bloques"], "readonly");
    const sesionesStore = transaction.objectStore("sesiones");
    const bloquesStore = transaction.objectStore("bloques");

    let sesiones = [];
    let bloques = [];

    // Cargar sesiones
    sesionesStore.openCursor().onsuccess = function (event) {
        const cursor = event.target.result;
        if (cursor) {
            sesiones.push(cursor.value);
            cursor.continue();
        } else {
            // Cuando terminan sesiones, cargamos bloques
            bloquesStore.openCursor().onsuccess = function (event) {
                const cursorBloque = event.target.result;
                if (cursorBloque) {
                    bloques.push(cursorBloque.value);
                    cursorBloque.continue();
                } else {
                    procesarEstadisticas(sesiones, bloques);
                }
            };
        }
    };
}

function procesarEstadisticas(sesiones, bloques) {
    const contenido = document.getElementById("contenido");

    if (sesiones.length === 0) {
        contenido.innerHTML += "<p>No hay datos todavía.</p>";
        return;
    }

    // ---------- RESUMEN GENERAL ----------
    let totalSesiones = sesiones.length;
    let distanciaTotal = 0;
    let duracionTotal = 0;

    let mejorDistancia = 0;
    let mejorDistanciaFecha = null;
    let mejorRitmo = 0;
    let mejorRitmoFecha = null;

    sesiones.forEach(s => {
        distanciaTotal += s.distancia_total;
        duracionTotal += s.duracion_total;

        // Mejor distancia
        if (s.distancia_total > mejorDistancia) {
            mejorDistancia = s.distancia_total;
            mejorDistanciaFecha = s.fecha;
        }

        // Mejor ritmo
        if (s.duracion_total > 0) {
            const ritmo = s.distancia_total / s.duracion_total;
            if (ritmo > mejorRitmo) {
                mejorRitmo = ritmo;
                mejorRitmoFecha = s.fecha;
            }
        }
    });

    const promedioDistancia = (distanciaTotal / totalSesiones).toFixed(1);
    const promedioDuracion = (duracionTotal / totalSesiones).toFixed(1);
    const ritmoHistorico = (distanciaTotal / duracionTotal).toFixed(2);

    contenido.innerHTML += `
        <h3>Resumen General</h3>
        <p>Sesiones: ${totalSesiones}</p>
        <p>Distancia total: ${distanciaTotal} m</p>
        <p>Duración total: ${duracionTotal} min</p>
        <p>Promedio distancia: ${promedioDistancia} m</p>
        <p>Promedio duración: ${promedioDuracion} min</p>
        <p>Ritmo promedio histórico: ${ritmoHistorico} m/min</p>
    `;

    // ---------- MEJOR DISTANCIA ----------
    if (mejorDistanciaFecha) {
        contenido.innerHTML += `
            <h3 class='section-title'>Mejor Distancia</h3>
            <p>${formatearFecha(mejorDistanciaFecha)} | ${mejorDistancia} m</p>
        `;
    }

    // ---------- MEJOR RITMO ----------
    if (mejorRitmoFecha) {
        contenido.innerHTML += `
            <h3 class='section-title'>Mejor Ritmo</h3>
            <p>${formatearFecha(mejorRitmoFecha)} | ${mejorRitmo.toFixed(2)} m/min</p>
        `;
    }

    // ---------- DIVISIÓN POR MES ----------
    let porMes = {};

    sesiones.forEach(s => {
        const fecha = new Date(s.fecha);
        const clave = `${fecha.getFullYear()}-${fecha.getMonth()}`;

        if (!porMes[clave]) {
            porMes[clave] = {
                sesiones: 0,
                distancia: 0,
                duracion: 0,
                mesTexto: fecha.toLocaleString("es-ES", { month: "long" }).toUpperCase(),
                anio: fecha.getFullYear()
            };
        }

        porMes[clave].sesiones++;
        porMes[clave].distancia += s.distancia_total;
        porMes[clave].duracion += s.duracion_total;
    });

    contenido.innerHTML += "<h3 class='section-title'>Por Mes</h3>";

    Object.values(porMes).forEach(m => {
        const promedioMes = (m.distancia / m.sesiones).toFixed(1);

        contenido.innerHTML += `
            <div style="margin-bottom:10px;">
                <strong>${m.mesTexto} ${m.anio}</strong><br>
                ${m.sesiones} sesiones<br>
                ${m.distancia} m totales<br>
                Promedio: ${promedioMes} m
            </div>
        `;
    });

    // ---------- DIVISIÓN POR ESTILO ----------
    let porEstilo = {};

    bloques.forEach(b => {
        if (!porEstilo[b.estilo]) {
            porEstilo[b.estilo] = 0;
        }
        porEstilo[b.estilo] += b.distancia;
    });

    contenido.innerHTML += "<h3 class='section-title'>Por Estilo</h3>";

    Object.keys(porEstilo).forEach(estilo => {
        contenido.innerHTML += `
            <div>
                ${estilo}: ${porEstilo[estilo]} m
            </div>
        `;
    });
}