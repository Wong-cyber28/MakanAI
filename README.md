# MakanAI 🥗
A Body-Neutral, AI-Powered Nutrition Tracker designed to eliminate diet anxiety while providing precise caloric insights. 

## 💡 Core Philosophy
Traditional calorie counters rely on tedious manual entry and often use aggressive UI elements (like red warning alerts) that can trigger body image anxiety. MakanAI reimagines dietary tracking:
- **Zero-Friction Logging**: Powered by Gemini Vision API to instantly analyze meals from photos.
- **Body-Neutral UI**: Objective data visualization without judgment. No red alerts, no guilt-tripping—just pure, actionable data.
- **Localized for SEA**: Optimized to recognize complex mixed dishes (e.g., Nasi Lemak, Mixed Rice) that traditional Western databases fail to identify.

## 🛠 Tech Stack
- **Frontend**: React Native, Expo, React Navigation
- **Backend & Auth**: Supabase (PostgreSQL, Edge Functions)
- **AI Engine**: Google Gemini Vision API
- **Data Visualization**: react-native-gifted-charts
- **Localization (i18n)**: English, Simplified Chinese, Malay, Korean

## 🚧 Technical Challenges Overcome

### 1. Combating Asynchronous Race Conditions
**Challenge**: Rapidly navigating between dates caused old network requests to overwrite newer ones, resulting in UI data flickering and ghost images.
**Solution**: Implemented robust cleanup functions using boolean flags (`ignore` pattern) inside React's `useEffect` to safely abort stale Supabase fetches, ensuring the UI always reflects the strictly requested date.

### 2. Edge-Overflow in High-Density Data Visualization
**Challenge**: In the 30-day (Month) history view, interactive tooltips on the outer edges were clipped by the screen boundaries, and standard pointer interactions were too erratic on narrow touch targets.
**Solution**: Deprecated the generic pointer configuration in favor of explicit `onPress` state management. Engineered a dynamic `topLabelComponent` that calculates the index of the tapped bar and applies directional `marginLeft` compensation to keep tooltips perfectly centered and on-screen.

### 3. AI Hallucination & Data Integrity Guardrails
**Challenge**: Users uploading non-food items (e.g., scenery, objects) would corrupt the database if the AI attempted to force a nutritional breakdown.
**Solution**: Engineered a strict pre-validation layer within the AI parsing logic. If Gemini flags the image as `isFood: false`, the app aggressively aborts the Supabase `.insert()` operation and gracefully alerts the user, maintaining absolute database purity.

## 🚀 Getting Started
(You can leave instructions here on how to run the app via Expo Go for reviewers).
