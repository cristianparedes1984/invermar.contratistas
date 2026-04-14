# Invermar – Dashboard de Accesos Pronexo

Dashboard web profesional y responsive para visualizar los datos de control de accesos del sistema Pronexo de Invermar.

## 🌐 Acceso

Abrir `index.html` en un servidor web o publicar con el tab Publish.

## ✅ Funcionalidades implementadas

- **Conexión en tiempo real** a Google Sheets pública (pestaña `Pronexo`) vía API GViz/CSV, sin necesidad de API key
- **Actualización automática** cada 5 minutos + botón manual de actualización
- **Filtros interactivos**: por Instalación y rango de fechas (mes/año)
- **5 KPIs en tarjetas**: Total registros, Personas únicas, Empresas únicas, Autorizados, No Autorizados
- **Gráfico 1 – Personas por mes**: barras con N° de personas únicas (RUT único) que ingresan cada mes
- **Gráfico 2 – Empresas por mes**: barras con N° de empresas únicas que ingresan cada mes
- **Gráfico 3 – Autorizados vs No Autorizados**: doughnut con etiquetas de cantidad y porcentaje
- **Tabla resumen** por Instalación: registros, personas únicas y empresas únicas
- **Diseño responsive** (mobile, tablet, desktop)
- **Logo Invermar** integrado en el header

## 🗂️ Estructura del proyecto

```
index.html          → Página principal del dashboard
css/style.css       → Estilos (fondo blanco, tonos azules)
js/dashboard.js     → Lógica de datos, filtros y gráficos
images/logo.png     → Logo Invermar
```

## 📊 Fuente de datos

| Parámetro | Valor |
|-----------|-------|
| Google Sheets ID | `1VjSgOE-xjVtAaBBiaNZqlv061I0PnjEamSbZMzeRcHc` |
| Pestaña | `Pronexo` |
| Columnas usadas | Fecha, Fecha_Formato, Rut consultado, Instalación, Datos de empresa, Respuesta de consulta |
| Autenticación | Sin requerimiento (hoja pública) |
| Frecuencia de actualización | Automática cada 5 min + manual |

## 🔧 Columnas mapeadas

| Columna en Sheets | Uso en dashboard |
|-------------------|-----------------|
| `Fecha_Formato` | Período YYYY-MM (eje X de gráficos) |
| `Rut consultado` | Identificador único de persona |
| `Instalación` | Filtro y tabla resumen |
| `Datos de empresa` | Extracción de RUT empresa (clave única) |
| `Respuesta de consulta` | Clasificación Autorizado / No Autorizado |

## 📦 Librerías CDN

- **Chart.js 4.4.3** – Gráficos
- **PapaParse 5.4.1** – Parseo de CSV
- **Font Awesome 6.4.0** – Iconos
- **Google Fonts Inter** – Tipografía

## 🚀 Próximas mejoras sugeridas

- Exportar tabla/gráficos a PDF o Excel
- Gráfico de tendencias por instalación
- Vista de detalle de registros con paginación
- Notificaciones de alertas por umbral de No Autorizados
