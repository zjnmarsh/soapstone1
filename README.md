# Soapstone Connect - React Native Web App

A premium React Native Web application built with Expo and Firebase.

## Setup Instructions

1. **Firebase Project**:
   - Go to [Firebase Console](https://console.firebase.google.com/).
   - Create a new project.
   - Add a "Web" app to your project.
   - Copy the configuration object (apiKey, authDomain, etc.).

2. **Configure App**:
   - Open `firebase.js` in the project root.
   - Replace the `firebaseConfig` placeholder with your actual project credentials.

3. **Firestore Database**:
   - Enable Firestore in your Firebase project.
   - Create a collection named `soapstones`.
   - Set rules to allow read/write (for development):
     ```
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /{document=**} {
           allow read, write: if true;
         }
       }
     }
     ```

4. **Run Application**:
   ```bash
   npm run web
   ```

## Data Structure
Each document in the `soapstones` collection contains:
- `message`: String
- `coordinate`: Map { lat: Number, lng: Number }
- `datetime`: Timestamp
- `elevation`: Number
- `upvotes`: Number
