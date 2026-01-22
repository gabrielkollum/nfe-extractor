let dadosExtraidos = null;
let sessaoAtual = null;

console.log('Popup carregado');

// Funções de criptografia simples
function criptografarSenha(senha) {
    const chave = 'nfe-extractor-2026';
    let resultado = '';
    for (let i = 0; i < senha.length; i++) {
        const charCode = senha.charCodeAt(i) ^ chave.charCodeAt(i % chave.length);
        resultado += String.fromCharCode(charCode);
    }
    return btoa(resultado); // Base64 encode
}

function descriptografarSenha(senhaCriptografada) {
    try {
        const chave = 'nfe-extractor-2026';
        const decodificada = atob(senhaCriptografada); // Base64 decode
        let resultado = '';
        for (let i = 0; i < decodificada.length; i++) {
            const charCode = decodificada.charCodeAt(i) ^ chave.charCodeAt(i % chave.length);
            resultado += String.fromCharCode(charCode);
        }
        return resultado;
    } catch (e) {
        console.error('Erro ao descriptografar senha:', e);
        return null;
    }
}

// Verificar se já está logado ao carregar o popup
chrome.storage.sync.get(['sessaoLogin'], (result) => {
    if (result.sessaoLogin) {
        sessaoAtual = result.sessaoLogin;
        mostrarTelaLogada();
    } else {
        mostrarTelaLogin();
    }
});

// Função para mostrar tela de login
function mostrarTelaLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainScreen').style.display = 'none';
}

// Função para mostrar tela principal (após login)
function mostrarTelaLogada() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'flex';
    
    if (sessaoAtual) {
        document.getElementById('usuarioLogado').textContent = sessaoAtual.usuario;
        document.getElementById('sistemaUrl').textContent = sessaoAtual.url;
    }
}

// Função para realizar login (reutilizável)
async function realizarLogin(url, usuario, senha) {
    // Validação
    if (!url || !usuario || !senha) {
        throw new Error('Preencha todos os campos!');
    }
    
    // Validar formato da URL
    let baseUrl;
    try {
        // Adicionar https:// se não estiver presente
        baseUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
        new URL(baseUrl);
    } catch (e) {
        throw new Error('URL inválida! Use o formato: http://exemplo.com');
    }
    
    // Chamar API para validar credenciais
    const authUrl = `${baseUrl}/auth/external`;
    console.log('Autenticando em:', authUrl);
    
    const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            email: usuario,
            password: senha
        })
    });
    
    console.log('Status da autenticação:', response.status);
    const result = await response.json();
    console.log('Resultado da autenticação:', result);
    console.log('Response:', response);
    
    if (response.ok && result.access_token) {
        // Autenticação bem-sucedida - salvar sessão
        sessaoAtual = {
            url: baseUrl,
            usuario: usuario,
            senha: criptografarSenha(senha),
            token: result.access_token || null,
            dataLogin: new Date().toISOString()
        };
        
        return new Promise((resolve) => {
            chrome.storage.sync.set({ sessaoLogin: sessaoAtual }, () => {
                resolve({ success: true, sessao: sessaoAtual });
            });
        });
    } else {
        // Falha na autenticação
        const mensagemErro = result.message || result.error || 'Credenciais inválidas';
        throw new Error(mensagemErro);
    }
}

// Botão de Login
document.getElementById('loginBtn').addEventListener('click', async () => {
    const url = document.getElementById('loginUrl').value.trim();
    const usuario = document.getElementById('loginUsuario').value.trim();
    const senha = document.getElementById('loginSenha').value.trim();
    
    // Desabilitar botão e mostrar loading
    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = true;
    loginBtn.textContent = '⏳ Autenticando...';
    
    try {
        await realizarLogin(url, usuario, senha);
        mostrarStatusLogin('success', '✓ Login realizado com sucesso!');
        setTimeout(() => {
            mostrarTelaLogada();
        }, 800);
    } catch (error) {
        console.error('Erro ao autenticar:', error);
        mostrarStatusLogin('error', `❌ ${error.message}`);
    } finally {
        // Reabilitar botão
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span class="btn-icon">✓</span>Entrar';
    }
});

// Botão de Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    chrome.storage.sync.remove(['sessaoLogin'], () => {
        sessaoAtual = null;
        document.getElementById('loginUrl').value = '';
        document.getElementById('loginUsuario').value = '';
        document.getElementById('loginSenha').value = '';
        mostrarTelaLogin();
    });
});

// Função para mostrar status de login
function mostrarStatusLogin(tipo, mensagem) {
    const statusDiv = document.getElementById('loginStatus');
    statusDiv.textContent = mensagem;
    statusDiv.className = `status ${tipo}`;
    statusDiv.style.display = 'block';
    
    if (tipo === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 2000);
    }
}

