# 🍟 MacFry SensoryVision Suite™

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-Latest-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.0-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

An industrial-grade, browser-based computer vision suite designed to analyze the quality of French fries. Using real-world industry standards like **Agtron Scores**, **USDA Color Scales**, and **McDonald's PQI (Product Quality Index)**, this tool provides laboratory-level analysis without a backend.

---

## 🏗️ Tech Stack

- **Frontend:** React 18 + TypeScript (Strict Mode)
- **Styling:** Tailwind CSS + Custom Design Tokens (Industrial Dark Theme)
- **Visualization:** Recharts (Hue Histograms)
- **Engine:** Browser Canvas API (Zero-server CV processing)
- **Calibration:** PPM (Pixels Per Millimeter) Spatial Engine
- **Build Tool:** Vite


---

## 🔬 Core Analysis Features

### 1. Color Science
The suite implements complex food-science metrics to ensure product consistency:
* **Agtron Score:** Calculates roast levels based on ITU-R BT.601 luminance.
* **USDA Scale:** Maps analysis to the standard 0.0–1.5 French fry color scale.
* **Farm Frites Hue:** Evaluates flesh yellowness/creamy yellow targets.

### 2. Defect Detection (The 1/3 Rule)
The engine utilizes a $20 \times 20$ grid-based segmentation to identify:
* **Burnt Areas:** High-intensity carbonization ($V < 0.25$).
* **Sugar Ends:** Localized caramelization in specific hue ranges.
* **Mottling:** Implements the **McDonald's Sensory Manual "1/3 Rule"**—color variations are only flagged if they cover $\geq 33.3\%$ of the strip width.

### 3. Spatial Calibration
Users can calibrate the system using real-world measurements ($mm$) to get defect reports in $mm^2$ instead of raw pixels, supporting standard strip sizes (1/4", 3/8", 7/16", 9/16").

---

## 📊 Scoring Logic: PQI (Product Quality Index)

The PQI is a sophisticated weighted algorithm that determines if a batch is "McDonald's Quality."

1.  **Rejection Check:** If any score hits 1 or 9 (Extremely Dark/Light), $PQI = 0\%$.
2.  **Failure Check:** If any score hits 2 or 8, $PQI = 25\%$.
3.  **Base Score:** Derived from the attribute furthest from the "Golden Target" (Score 5).
4.  **Bonus:** Accuracy rewards for attributes hitting the target exactly.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (Version 18 or higher)
- npm or pnpm

### Features:

- 📊 View historical scans in the **Batch Tab**
- 📈 Compare **Median Hue** and **Agtron trends** across samples
- 📤 Export full audit data using:

## 🎨 Design System

The UI follows an **Industrial Dark Theme** defined in `index.css`.

### 🎨 Color System

| Variable        | Value | Description |
|----------------|-------|------------|
| `--background` | `220 20% 7%` | Deep Navy-Black |
| `--gold`       | `42 95% 52%` | Signature Industrial Gold |
| `--panel`      | `220 20% 10%` | Elevated panels with subtle borders |

---

## ✍ Typography

- **DM Mono**  
  Used for:
  - Technical data  
  - Coordinates  
  - Pixel metrics  

- **Barlow Condensed**  
  Used for:
  - High-impact headings  
  - Industrial labels  

---

## ⚖️ License

**Internal Use / Proprietary**  
For Quality Assurance Labs only.

---

Developed with ❤️ for the perfect fry.
