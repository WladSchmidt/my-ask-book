// --- VARIÁVEIS GLOBAIS ---
let unsubscribeRespostas = null;
let usuarioAtual = null;
let meusAmigos = [];
let chatAtualId = null;
let chatAtualEmailAmigo = null;
let unsubscribeChat = null;
let mapaNomesAmigos = {}; 
let ultimoInputFocado = null; 
let editandoCadernoId = null; 
let bolhasAtivas = {}; 
let timeoutSalvar = null; // Variável de controle do delay (Debounce)

// --- AUTENTICAÇÃO E START ---
auth.onAuthStateChanged(user => {
    if (user) {
        usuarioAtual = user;
        salvarUsuarioNoBanco();
        carregarMeusAmigosDoBanco();
        atualizarUIUsuario();
        monitorarNotificacoes();
        navegarPara('screen-feed');
    } else {
        navegarPara('screen-login');
        document.getElementById('screen-loading').style.display = 'none';
    }
});

function fazerLoginGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch((error) => alert("Erro: " + error.message));
}
function fazerLogout() { auth.signOut().then(() => window.location.reload()); }

function atualizarUIUsuario() {
    if (usuarioAtual) {
        document.getElementById('user-name').innerText = usuarioAtual.displayName.split(' ')[0];
        document.getElementById('user-img').src = usuarioAtual.photoURL;
    }
}

function salvarUsuarioNoBanco() {
    db.collection('usuarios').doc(usuarioAtual.uid).set({
        email: usuarioAtual.email,
        nome: usuarioAtual.displayName,
        nome_busca: usuarioAtual.displayName.toLowerCase(), 
        foto: usuarioAtual.photoURL
    }, { merge: true });
}

function carregarMeusAmigosDoBanco() {
    db.collection('usuarios').doc(usuarioAtual.uid).onSnapshot(doc => {
        if (doc.exists && doc.data().amigos) {
            meusAmigos = doc.data().amigos;
        } else {
            meusAmigos = [];
        }
        carregarFeed();
    });
}

function enviarPedidoAmizade() {
    const input = document.getElementById('input-friend-email');
    const emailDestino = input.value.trim().toLowerCase();
    if (!emailDestino || emailDestino === usuarioAtual.email) return alert("Email inválido.");
    if (meusAmigos.includes(emailDestino)) return alert("Vocês já são amigos!");
    db.collection('notificacoes').add({
        de: usuarioAtual.email, deNome: usuarioAtual.displayName, para: emailDestino,
        tipo: 'pedido_amizade', status: 'pendente', data: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => { alert("Pedido enviado!"); input.value = ""; }).catch(err => alert("Erro ao enviar."));
}

function monitorarNotificacoes() {
    db.collection('notificacoes').where('para', '==', usuarioAtual.email).where('status', '==', 'pendente')
        .onSnapshot(snapshot => {
            const badge = document.getElementById('notif-badge');
            const lista = document.getElementById('lista-notificacoes');
            let countSino = 0;
            lista.innerHTML = "";
            
            snapshot.forEach(doc => {
                const notif = doc.data();
                if(notif.tipo === 'nova_mensagem') {
                    criarOuAtualizarBolha(notif.de, notif.deNome, doc.id);
                } else {
                    countSino++;
                    const li = document.createElement('li'); li.className = 'notif-item';
                    li.innerHTML = `<span><strong>${notif.deNome}</strong> quer ser amigo.</span>
                        <div class="notif-actions"><button class="btn-accept" onclick="responderAmizade('${doc.id}', '${notif.de}', true)">Aceitar</button><button class="btn-deny" onclick="responderAmizade('${doc.id}', '${notif.de}', false)">Recusar</button></div>`;
                    lista.appendChild(li);
                }
            });

            if (countSino > 0) {
                badge.style.display = 'flex'; badge.innerText = countSino;
            } else {
                badge.style.display = 'none';
                if(lista.children.length === 0) lista.innerHTML = "<li style='padding:10px; color:#777;'>Nenhuma notificação nova.</li>";
            }
        });
}

function criarOuAtualizarBolha(emailRemetente, nomeRemetente, idNotificacao) {
    const container = document.getElementById('bubbles-container');
    if (document.getElementById('chat-modal').style.display === 'flex' && chatAtualEmailAmigo === emailRemetente) {
        db.collection('notificacoes').doc(idNotificacao).delete();
        return;
    }
    if (bolhasAtivas[emailRemetente]) {
        const badge = bolhasAtivas[emailRemetente].querySelector('.bubble-badge');
        let count = parseInt(badge.innerText) + 1;
        badge.innerText = count;
        return;
    }
    const bolha = document.createElement('div');
    bolha.className = 'chat-bubble';
    bolha.innerText = nomeRemetente.charAt(0).toUpperCase();
    bolha.onclick = () => {
        abrirChat(emailRemetente, nomeRemetente);
        bolha.remove();
        delete bolhasAtivas[emailRemetente];
        db.collection('notificacoes').where('de', '==', emailRemetente).where('tipo', '==', 'nova_mensagem').get().then(snap => {
            snap.forEach(d => d.ref.delete());
        });
    };
    const badge = document.createElement('div');
    badge.className = 'bubble-badge';
    badge.innerText = '1';
    
    bolha.appendChild(badge);
    container.appendChild(bolha);
    bolhasAtivas[emailRemetente] = bolha;
}

function toggleNotificacoes() {
    const modal = document.getElementById('notif-modal');
    modal.style.display = (modal.style.display === 'block') ? 'none' : 'block';
}

function responderAmizade(idNotificacao, emailAmigo, aceitou) {
    const batch = db.batch();
    const notifRef = db.collection('notificacoes').doc(idNotificacao);
    batch.update(notifRef, { status: aceitou ? 'aceito' : 'recusado' });

    if (aceitou) {
        const meuRef = db.collection('usuarios').doc(usuarioAtual.uid);
        batch.set(meuRef, { amigos: firebase.firestore.FieldValue.arrayUnion(emailAmigo), email: usuarioAtual.email }, { merge: true });
        db.collection('usuarios').where('email', '==', emailAmigo).get().then(snapshot => {
            if(!snapshot.empty) {
                snapshot.docs[0].ref.update({ amigos: firebase.firestore.FieldValue.arrayUnion(usuarioAtual.email) });
            }
        });
        alert("Amizade aceita!");
    }
    batch.commit().then(() => toggleNotificacoes());
}

function removerAmigo(email) {
    if(!confirm("Desfazer amizade com " + email + "?")) return;
    db.collection('usuarios').doc(usuarioAtual.uid).update({
        amigos: firebase.firestore.FieldValue.arrayRemove(email)
    });
    db.collection('usuarios').where('email', '==', email).get().then(snapshot => {
        if(!snapshot.empty) {
            snapshot.docs[0].ref.update({
                amigos: firebase.firestore.FieldValue.arrayRemove(usuarioAtual.email)
            });
        }
    });
}

function renderizarListaAmigos() {
    const ul = document.getElementById('lista-amigos-sidebar'); ul.innerHTML = "";
    meusAmigos.forEach(email => {
        const nome = mapaNomesAmigos[email] || email.split('@')[0];
        ul.innerHTML += `<li class="friend-item"><div><span style="font-size:16px; font-weight:bold; color:#ddd;">${nome}</span></div><div class="friend-actions"><button class="btn-icon" onclick="abrirChat('${email}', '${nome}')">💬</button><button class="btn-icon" style="color:#ff5252" onclick="removerAmigo('${email}')">🗑️</button></div></li>`;
    });
}

function abrirChat(email, nome) {
    const emails = [usuarioAtual.email, email].sort();
    chatAtualId = emails[0].replace(/\./g, '_') + "-" + emails[1].replace(/\./g, '_');
    chatAtualEmailAmigo = email;

    const chatModal = document.getElementById('chat-modal');
    chatModal.style.display = 'flex';
    document.getElementById('chat-friend-name').innerText = nome;
    
    fecharMenus();
    if (unsubscribeChat) unsubscribeChat();
    unsubscribeChat = db.collection('chats').doc(chatAtualId).collection('mensagens').orderBy('data', 'asc').onSnapshot(snapshot => {
        const b = document.getElementById('chat-body'); b.innerHTML = "";
        snapshot.forEach(doc => {
            const msg = doc.data(); const d = document.createElement('div');
            d.className = `chat-msg ${msg.email === usuarioAtual.email ? 'msg-me' : 'msg-friend'}`; d.innerText = msg.texto;
            b.appendChild(d);
        });
        b.scrollTop = b.scrollHeight;
    });
}

function minimizarChat() {
    const chatModal = document.getElementById('chat-modal');
    chatModal.style.display = 'none';
    if (chatAtualEmailAmigo) {
        const nomeAmigo = document.getElementById('chat-friend-name').innerText;
        const container = document.getElementById('bubbles-container');
        const bolha = document.createElement('div');
        bolha.className = 'chat-bubble';
        bolha.innerText = nomeAmigo.charAt(0).toUpperCase();
        bolha.onclick = () => {
            abrirChat(chatAtualEmailAmigo, nomeAmigo);
            bolha.remove();
        };
        container.appendChild(bolha);
    }
}

function enviarMensagemChat() {
    const i = document.getElementById('chat-input'); const t = i.value.trim(); if (!t) return;
    
    db.collection('chats').doc(chatAtualId).collection('mensagens').add({ texto: t, email: usuarioAtual.email, data: firebase.firestore.FieldValue.serverTimestamp() });
    
    if (chatAtualEmailAmigo) {
        db.collection('notificacoes').add({
            de: usuarioAtual.email,
            deNome: usuarioAtual.displayName,
            para: chatAtualEmailAmigo,
            tipo: 'nova_mensagem',
            status: 'pendente',
            data: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    i.value = "";
}

function fecharChat() { 
    document.getElementById('chat-modal').style.display = 'none'; 
    chatAtualEmailAmigo = null;
    if (unsubscribeChat) unsubscribeChat();
}

function carregarFeed() {
    const grid = document.getElementById('grid-cadernos');
    db.collection('cadernos').onSnapshot((snapshot) => {
        document.getElementById('screen-loading').style.display = 'none'; // Some o loading
        document.getElementById('loading').style.display = 'none'; grid.innerHTML = ""; mapaNomesAmigos = {}; 
        const tut = document.createElement('div'); tut.className = "friend-book bg-jeans";
        tut.innerHTML = `<div class="book-label">Como Usar?</div>`; tut.onclick = abrirTutorial;
        grid.appendChild(tut);
        snapshot.forEach((doc) => {
            const d = doc.data(); if (!d.donoNome) return;
            mapaNomesAmigos[d.donoEmail] = d.donoNome;
            if (d.donoEmail === usuarioAtual.email || meusAmigos.includes(d.donoEmail)) {
                const div = document.createElement('div'); div.className = `friend-book ${d.corCapa || 'bg-draft'}`;
                let btns = `<div class="book-label">${d.donoNome}</div>`;
                if (d.donoEmail === usuarioAtual.email) {
                    btns += `<button class="btn-action-book btn-delete-book" onclick="excluirCaderno('${doc.id}')">✕</button>`;
                    btns += `<button class="btn-action-book btn-edit-book" onclick="editarMeuCaderno('${doc.id}')">✎</button>`;
                }
                div.innerHTML = btns;
                div.onclick = (e) => { if(!e.target.className.includes('btn-action')) abrirCadernoParaResponder(doc.id, d); };
                grid.appendChild(div);
            }
        });
        renderizarListaAmigos();
    });
}

function editarMeuCaderno(id) {
    db.collection('cadernos').doc(id).get().then(doc => {
        if(!doc.exists) return;
        const dados = doc.data();
        navegarPara('screen-create');
        document.getElementById('input-meu-nome').value = dados.donoNome;
        selecionarCorCapa(dados.corCapa || 'bg-draft', document.querySelector(`.mini-book.${dados.corCapa}`));
        const lista = document.getElementById('lista-criacao');
        lista.innerHTML = ""; 
        dados.perguntas.forEach(p => adicionarNovaLinha(p));
        editandoCadernoId = id;
    });
}

function verificarSeJaTemCaderno() {
    if (!usuarioAtual) return;
    editandoCadernoId = null;
    navegarPara('screen-create');
    document.getElementById('input-meu-nome').value = usuarioAtual.displayName;
    const lista = document.getElementById('lista-criacao');
    lista.innerHTML = "";
    
    adicionarNovaLinha("Qual sua banda predileta ?");
    adicionarNovaLinha("Qual seu filme predileto ?");
    adicionarNovaLinha("Qual seu maior sonho ?");
    adicionarNovaLinha("Um país em que você sonha visitar...");
    adicionarNovaLinha("Qual sua comida predileta ?");
}

function adicionarNovaLinha(txt = "") {
    const l = document.getElementById('lista-criacao'); const n = l.children.length + 1;
    const li = document.createElement('li'); li.className = 'question-item';
    li.innerHTML = `<div class="line-container"><span class="number-marker">${n < 10 ? '0'+n : n}.</span><input type="text" class="create-input" value="${txt}" style="color:${document.getElementById('colorPickerCriacao').value}" placeholder="..." onfocus="ultimoInputFocado = this"></div>`;
    l.appendChild(li);
}

function salvarNovoCadernoNoBanco() {
    const inps = document.querySelectorAll('.create-input'); const p = [];
    inps.forEach(i => { if (i.value.trim()) p.push(i.value); });
    if (!p.length) return alert("Crie uma pergunta!");
    const dadosToSave = {
        donoNome: document.getElementById('input-meu-nome').value, 
        donoEmail: usuarioAtual.email, 
        corCapa: document.getElementById('input-cor-capa').value, 
        perguntas: p, 
        dataCriacao: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (editandoCadernoId) {
        db.collection('cadernos').doc(editandoCadernoId).update(dadosToSave)
            .then(() => { alert("Atualizado!"); navegarPara('screen-feed'); });
    } else {
        db.collection('cadernos').doc(usuarioAtual.uid).set(dadosToSave)
            .then(() => { alert("Publicado!"); navegarPara('screen-feed'); });
    }
}

function abrirTutorial() {
    abrirCadernoParaResponder("tutorial", {
        donoNome: "Tutorial",
        perguntas: [
            "Bem-vindo ao My Ask Book!",
            "Você irá descobrir diversas curiosidades sobre seus amigos.",
            "Crie o seu caderno e comece a interagir.",
            "Adicione amigos no menu lateral e converse com eles em tempo real.",
            "Não esqueça de responder os cadernos de seus amigos, entre na brincadeira!"
        ]
    });
}

function excluirCaderno(id) { if (confirm("Apagar?")) db.collection('cadernos').doc(id).delete(); }
function selecionarCorCapa(classe, el) {
    document.getElementById('input-cor-capa').value = classe;
    document.querySelectorAll('.mini-book').forEach(c => c.classList.remove('selected'));
    if(el) el.classList.add('selected'); 
}

function abrirCadernoParaResponder(id, dados) {
    idCadernoAberto = id; 
    navegarPara('screen-notebook');
    document.getElementById('titulo-caderno').innerText = "Caderno de " + dados.donoNome;
    document.querySelector('.pen-tool').style.display = (id === 'tutorial') ? 'none' : 'block';
    
    // Limpa listener anterior se houver
    if (unsubscribeRespostas) {
        unsubscribeRespostas();
        unsubscribeRespostas = null;
    }

    const lista = document.getElementById('lista-perguntas-leitura'); 
    lista.innerHTML = "<p>Carregando...</p>";
    
    if (id === 'tutorial') { 
        renderizarPerguntasERespostas(dados, []); 
        return; 
    }

    // --- TEMPO REAL ATIVADO ---
    unsubscribeRespostas = db.collection('cadernos').doc(id).collection('respostas')
        .onSnapshot(snap => {
            const resps = []; 
            snap.forEach(doc => resps.push({ uid: doc.id, dados: doc.data() }));
            renderizarPerguntasERespostas(dados, resps);
        });
}

function renderizarPerguntasERespostas(caderno, respostas) {
    const lista = document.getElementById('lista-perguntas-leitura'); 
    lista.innerHTML = "";
    
    caderno.perguntas.forEach((perg, idx) => {
        const pid = `resp_${idx}`; 
        const n = idx + 1;
        
        const li = document.createElement('li'); 
        li.className = 'question-item';
        li.innerHTML = `<div class="line-container"><span class="number-marker">${n < 10 ? '0'+n : n}.</span><span class="question-text">${perg}</span></div>`;
        lista.appendChild(li);
        
        respostas.forEach(r => {
            if (r.dados[pid]) {
                // Se for eu, não renderiza aqui, e sim no textarea
                if(r.uid === usuarioAtual.uid) return;

                const pickerId = `picker_${r.uid}_${pid}`;
                let htmlReacoes = "";
                if (r.dados[pid].reacoes) {
                    const listaEmojis = Object.values(r.dados[pid].reacoes);
                    if (listaEmojis.length > 0) {
                        const unicos = [...new Set(listaEmojis)].slice(0, 4).join('');
                        htmlReacoes = `<span class="reaction-list">${unicos}</span>`;
                    }
                }

                const amg = document.createElement('li'); 
                amg.className = 'question-item';
                amg.innerHTML = `
                    <div class="line-container answer-container">
                        <div class="friend-answer-line" style="color:${r.dados[pid].cor}">
                            <strong style="margin-right:5px">${r.dados.nomeQuemRespondeu}:</strong> ${r.dados[pid].texto}
                            <div class="reaction-wrapper">
                                ${htmlReacoes}
                                <button class="btn-add-reaction" onclick="toggleReactionPicker('${pickerId}')">☺</button> 
                                <div id="${pickerId}" class="reaction-picker-popup" style="display:none;">
                                    <span class="reaction-option" onclick="salvarReacao('${idCadernoAberto}', '${r.uid}', '${pid}', '❤️')">❤️</span>
                                    <span class="reaction-option" onclick="salvarReacao('${idCadernoAberto}', '${r.uid}', '${pid}', '🔥')">🔥</span>
                                    <span class="reaction-option" onclick="salvarReacao('${idCadernoAberto}', '${r.uid}', '${pid}', '😂')">😂</span>
                                    <span class="reaction-option" onclick="salvarReacao('${idCadernoAberto}', '${r.uid}', '${pid}', '😮')">😮</span>
                                    <span class="reaction-option" onclick="salvarReacao('${idCadernoAberto}', '${r.uid}', '${pid}', '😢')">😢</span>
                                    <span class="reaction-option" onclick="salvarReacao('${idCadernoAberto}', '${r.uid}', '${pid}', '👏')">👏</span>
                                    <span class="reaction-option" onclick="salvarReacao('${idCadernoAberto}', '${r.uid}', '${pid}', '👍')">👍</span>
                                    <span class="reaction-option" onclick="salvarReacao('${idCadernoAberto}', '${r.uid}', '${pid}', '👎')">👎</span>
                                </div>
                            </div>
                        </div>
                    </div>`;
                lista.appendChild(amg);
            }
        });

        // MINHA RESPOSTA (TEXTAREA AGORA)
        if (idCadernoAberto !== 'tutorial') {
            const meuLi = document.createElement('li'); 
            meuLi.className = 'question-item';
            let txt = "", cor = document.getElementById('colorPickerResposta').value;
            const minha = respostas.find(r => r.uid === usuarioAtual.uid);
            
            if (minha && minha.dados[pid]) { 
                txt = minha.dados[pid].texto; 
                cor = minha.dados[pid].cor; 
            }
            
            // oninput = agenda salvar (Debounce)
            // onblur = salva imediatamente (PC)
            meuLi.innerHTML = `
                <div class="line-container answer-container">
                    <textarea class="answer-input" id="${pid}" style="color:${cor}" 
                        placeholder="Sua resposta..." 
                        oninput="agendarSalvamento(this)" 
                        onblur="salvarImediatamente(this)"
                        onfocus="ultimoInputFocado = this">${txt}</textarea>
                </div>`;
            lista.appendChild(meuLi);
        }
    });
}

// --- FUNÇÕES DE SALVAMENTO INTELIGENTE (DEBOUNCE) ---

function agendarSalvamento(el) {
    // 1. Ajusta altura automaticamente (UX Profissional)
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight) + 'px';

    // 2. Cancela timer anterior e espera 1.5s
    clearTimeout(timeoutSalvar);
    timeoutSalvar = setTimeout(() => {
        executarSalvar(el);
    }, 1500); 
}

function salvarImediatamente(el) {
    clearTimeout(timeoutSalvar);
    executarSalvar(el);
}

function executarSalvar(inp) {
    if (!usuarioAtual || idCadernoAberto === 'tutorial') return;
    const dados = {}; 
    const cor = inp.style.color || document.getElementById('colorPickerResposta').value;
    dados[inp.id] = { texto: inp.value, cor: cor };
    dados.nomeQuemRespondeu = document.getElementById('input-meu-nome').value || usuarioAtual.displayName;
    
    db.collection('cadernos').doc(idCadernoAberto).collection('respostas').doc(usuarioAtual.uid).set(dados, { merge: true });
}

// Corrigir Lápis
document.querySelectorAll('input[type="color"]').forEach(picker => {
    picker.addEventListener('input', function() {
        if (ultimoInputFocado) {
            ultimoInputFocado.style.color = this.value;
            if (ultimoInputFocado.classList.contains('answer-input')) agendarSalvamento(ultimoInputFocado);
        }
    });
});

function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('overlay').classList.toggle('visible'); }
function fecharMenus() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('visible'); }

function navegarPara(id) { document.querySelectorAll('.screen').forEach(s => s.style.display = 'none'); document.getElementById(id).style.display = 'flex'; }

// --- SISTEMA DE REAÇÕES (V12.0) ---
function toggleReactionPicker(elementId) {
    const picker = document.getElementById(elementId);
    document.querySelectorAll('.reaction-picker-popup').forEach(p => {
        if(p.id !== elementId) p.style.display = 'none';
    });
    picker.style.display = (picker.style.display === 'flex') ? 'none' : 'flex';
}

function salvarReacao(cadernoId, respondenteId, perguntaId, emoji) {
    document.querySelectorAll('.reaction-picker-popup').forEach(p => p.style.display = 'none');
    const docRef = db.collection('cadernos').doc(cadernoId).collection('respostas').doc(respondenteId);
    return db.runTransaction(transaction => {
        return transaction.get(docRef).then(doc => {
            if (!doc.exists) return;
            const data = doc.data();
            if (!data[perguntaId]) return;
            if (!data[perguntaId].reacoes) data[perguntaId].reacoes = {};
            const reacaoAtual = data[perguntaId].reacoes[usuarioAtual.uid];
            if (reacaoAtual === emoji) { delete data[perguntaId].reacoes[usuarioAtual.uid]; } 
            else { data[perguntaId].reacoes[usuarioAtual.uid] = emoji; }
            transaction.update(docRef, { [perguntaId]: data[perguntaId] });
        });
    });
}

// --- BUSCA V13.6 ---
function buscarUsuarios() {
    const input = document.getElementById('input-friend-email');
    const termo = input.value.trim().toLowerCase();
    const resultadosDiv = document.getElementById('lista-resultados-busca');
    if (termo.length < 3) { resultadosDiv.style.display = 'none'; resultadosDiv.innerHTML = ""; return; }
    db.collection('usuarios').where('nome_busca', '>=', termo).where('nome_busca', '<=', termo + '\uf8ff').limit(5).get().then(snapshot => {
        resultadosDiv.innerHTML = ""; let encontrouAlguem = false;
        if (snapshot.empty) { resultadosDiv.style.display = 'block'; resultadosDiv.innerHTML = '<div style="padding:10px; color:#bbb; font-size:12px;">Ninguém encontrado...</div>'; return; }
        resultadosDiv.style.display = 'block';
        snapshot.forEach(doc => {
            const user = doc.data(); encontrouAlguem = true; let htmlAcao = '';
            if (user.email === usuarioAtual.email) htmlAcao = '<span class="badge-me">Você</span>';
            else if (meusAmigos.includes(user.email)) htmlAcao = '<span class="badge-friend">Amigo ✔</span>';
            else htmlAcao = `<button class="btn-add-mini" onclick="enviarPedidoPorBusca('${user.email}')" title="Enviar pedido">+</button>`;
            const div = document.createElement('div'); div.className = 'search-result-item';
            div.innerHTML = `<img src="${user.foto || 'https://via.placeholder.com/30'}" class="mini-avatar"><div style="flex:1; display:flex; flex-direction:column; align-items:flex-start;"><span style="font-weight:bold; font-size:14px; color:white;">${user.nome}</span><span style="font-size:10px; color:#aaa;">${user.email}</span></div>${htmlAcao}`;
            resultadosDiv.appendChild(div);
        });
        if (!encontrouAlguem) resultadosDiv.innerHTML = '<div style="padding:10px; color:#bbb; font-size:12px;">Ninguém encontrado...</div>';
    });
}
function enviarPedidoPorBusca(emailDestino) {
    document.getElementById('input-friend-email').value = emailDestino; enviarPedidoAmizade();
    document.getElementById('lista-resultados-busca').style.display = 'none';
}
