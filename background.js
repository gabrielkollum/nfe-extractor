/**
 * Service Worker - Gerencia eventos em background
 */

// console.log('Background service worker iniciado');

// Evento de instalação
chrome.runtime.onInstalled.addListener((details) => {
    // console.log('NFe Data Extractor instalado!', details);
    
    // Configurações padrão
    chrome.storage.sync.set({
        apiUrl: 'http://localhost:8000'
    }, () => {
        console.log('Configurações padrão definidas');
    });
    
    // Mostrar página de boas-vindas (opcional)
    if (details.reason === 'install') {
        console.log('Primeira instalação detectada');
    }
});

// Listener para mensagens
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Mensagem recebida no background:', request);
    
    if (request.action === 'log') {
        console.log('[Content Script]:', request.message);
    }
    
    return true;
});

// Manter o service worker ativo
chrome.runtime.onStartup.addListener(() => {
    console.log('Browser iniciado, service worker ativo');
});