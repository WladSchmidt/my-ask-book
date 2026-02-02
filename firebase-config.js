// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAgcjqoOBIlgdHyhaZLvyPS4kn_wDlt65s",
  authDomain: "my-ask-book.firebaseapp.com",
  projectId: "my-ask-book",
  storageBucket: "my-ask-book.firebasestorage.app",
  messagingSenderId: "49716420840",
  appId: "1:49716420840:web:aed419b89144f3f020e95d",
  measurementId: "G-X0J2BW2HWY"
};

// Inicializa o Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Exporta as variáveis para serem usadas no script.js
const auth = firebase.auth();
const db = firebase.firestore();