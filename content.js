/**
 * Content Script - Roda na página da SEFAZ
 * Extrai dados da NFe exibida na página
 */

console.log('NFe Extractor: Content script carregado');

// Funções de criptografia (duplicadas do popup.js para uso no content script)
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

function criptografarSenha(senha) {
    const chave = 'nfe-extractor-2026';
    let resultado = '';
    for (let i = 0; i < senha.length; i++) {
        const charCode = senha.charCodeAt(i) ^ chave.charCodeAt(i % chave.length);
        resultado += String.fromCharCode(charCode);
    }
    return btoa(resultado); // Base64 encode
}


// Adicionar indicador visual quando a extensão está ativa
function adicionarIndicadorVisual() {
    // Verificar se já existe
    if (document.getElementById('nfe-extractor-indicator')) return;

    const indicador = document.createElement('div');
    indicador.id = 'nfe-extractor-indicator';
    indicador.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        font-family: Arial, sans-serif;
        font-size: 13px;
        font-weight: 600;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        animation: slideInRight 0.5s ease;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    indicador.innerHTML = `
        <span style="font-size: 18px;">✓</span>
        <span>NFe Extractor Ativo</span>
    `;

    document.body.appendChild(indicador);

    // Remover após 4 segundos com fade out
    setTimeout(() => {
        indicador.style.animation = 'fadeOut 0.5s ease';
        setTimeout(() => indicador.remove(), 500);
    }, 4000);

    // Adicionar estilos de animação
    if (!document.getElementById('nfe-extractor-styles')) {
        const style = document.createElement('style');
        style.id = 'nfe-extractor-styles';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes fadeOut {
                to {
                    opacity: 0;
                    transform: translateX(400px);
                }
            }
        `;
        document.head.appendChild(style);
    }
}

function chaveAcessoApareceu() {
    // obtem valor do xpath //*[@id="conteudoDinamico"]/div[3]/div[1]/fieldset/table/tbody/tr/td[1]/span
    const valor = document.evaluate(
        '//*[@id="conteudoDinamico"]/div[3]/div[1]/fieldset/table/tbody/tr/td[1]/span',
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    ).singleNodeValue;

    if (valor) {
        console.log('Chave de Acesso:', valor.textContent);
    } else {
        console.log('Chave de acesso não encontrada');
    }

    // Obter conteúdo HTML dos produtos
    const produtosDiv = document.evaluate(
        '//*[@id="Prod"]/fieldset/div',
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    ).singleNodeValue;
    
    if (produtosDiv) {
        console.log('Div de produtos encontrada, iniciando extração...');
        const htmlProdutos = produtosDiv.innerHTML;
        const produtos = extrairProdutosDaNota(htmlProdutos);
        
        console.log(`✓ Extração concluída: ${produtos.length} produto(s) encontrado(s)`);
        
        // Aqui você pode fazer algo com os produtos extraídos
        // Por exemplo, enviar para o sistema ou armazenar
        if (produtos.length > 0) {
            console.table(produtos);
        }

        enviarDadosParaSmartOticas({chave_acesso: valor.textContent, produtos: produtos});
    } else {
        console.log('Div de produtos não encontrada');
    }
}

// Função auxiliar para reautenticar
async function reautenticar(sessao) {
    try {
        const senhaDescriptografada = descriptografarSenha(sessao.senha);
        if (!senhaDescriptografada) {
            throw new Error('Erro ao descriptografar senha');
        }

        const authUrl = `${sessao.url}/auth/external`;
        console.log('Reautenticando em:', authUrl);
        
        const response = await fetch(authUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                email: sessao.usuario,
                password: senhaDescriptografada
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.access_token) {
            // Atualizar sessão com novo token
            const novaSessao = {
                ...sessao,
                senha: criptografarSenha(senhaDescriptografada),
                token: result.access_token,
                dataLogin: new Date().toISOString()
            };
            
            await chrome.storage.sync.set({ sessaoLogin: novaSessao });
            console.log('✓ Reautenticação bem-sucedida');
            return novaSessao;
        } else {
            throw new Error('Falha na reautenticação');
        }
    } catch (error) {
        console.error('Erro ao reautenticar:', error);
        throw error;
    }
}

// Função para enviar dados para o sistema SmartOticas
async function enviarDadosParaSmartOticas(dados) {
    console.log('Enviando dados para SmartOticas...', dados);

    try {
        // Buscar dados da sessão do storage
        const result = await chrome.storage.sync.get(['sessaoLogin']);
        
        console.log('Dados da sessão obtidos:', result);
        if (!result.sessaoLogin) {
            console.error('Sessão não encontrada. Faça login no SmartOticas primeiro.');
            return { success: false, message: 'Sessão não encontrada' };
        }

        let sessao = result.sessaoLogin;
        
        if (!sessao.url || !sessao.token) {
            console.error('URL ou token não encontrados na sessão');
            return { success: false, message: 'Dados de sessão incompletos' };
        }

        // Construir a URL completa
        const url = `${sessao.url}/api/estoque/importar-nfe`;
        
        console.log(`Enviando POST para: ${url}`);

        let tentativaDeReautenticacao = false;
        let response;
        try {
            // Fazer a requisição POST
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessao.token}`
                },
                body: JSON.stringify(dados)
            });

            // Verificar se houve erro ou redirect para /login
            if (!response.ok) {
                throw new Error(`Erro na requisição: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.log('⚠️ Erro na requisição. Tentando reautenticar...', error.message);
            
            try {
                // Tentar reautenticar
                sessao = await reautenticar(sessao);
                tentativaDeReautenticacao = true;
                
                // Tentar enviar novamente com novo token
                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessao.token}`
                    },
                    body: JSON.stringify(dados)
                });
                
                console.log('✓ Requisição reenviada após reautenticação');
                
                if (!response.ok) {
                    adicionarIndicadorVisualDeErro(`Erro na requisição após reautenticação: ${response.status} ${response.statusText}`);
                    throw new Error(`Erro na requisição após reautenticação: ${response.status} ${response.statusText}`);
                }
            } catch (reAuthError) {
                console.error('Erro ao reautenticar:', reAuthError);
                adicionarIndicadorVisualDeErro('Erro ao reautenticar. Verifique suas credenciais.');
                return { success: false, message: 'Sessão expirada. Faça login novamente.' };
            }
        }

        const resultado = await response.json();
        console.log('✓ Dados enviados com sucesso:', resultado);
        
        if (tentativaDeReautenticacao) {
            console.log('✓ Envio bem-sucedido após reautenticação automática');
        }
        
        adicionarIndicadorVisualDeSucessoDeEnvio();
        return { success: true, data: resultado };

    } catch (error) {
        console.error('Erro ao enviar dados para SmartOticas:', error);
        adicionarIndicadorVisualDeErro(`Erro ao enviar dados: ${error.message}`);
        return { success: false, message: error.message };
    }
}

// Indicador visual de sucesso no envio
function adicionarIndicadorVisualDeSucessoDeEnvio() {
    // Verificar se já existe
    if (document.getElementById('nfe-extractor-success-indicator')) return;

    const indicador = document.createElement('div');
    indicador.id = 'nfe-extractor-success-indicator';
    indicador.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        font-weight: 600;
        z-index: 9999999;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        animation: slideInRight 0.5s ease;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 300px;
    `;

    indicador.innerHTML = `
        <span style="font-size: 20px;">✓</span>
        <span style="flex: 1;">Dados da Nota Fiscal enviados para o SmartOticas</span>
        <button id="nfe-close-success" style="
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'" 
           onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'">×</button>
    `;

    document.body.appendChild(indicador);

    // Função para remover o indicador
    const removerIndicador = () => {
        indicador.style.animation = 'fadeOut 0.5s ease';
        setTimeout(() => indicador.remove(), 500);
    };

    // Adicionar evento de clique no botão X
    const btnFechar = document.getElementById('nfe-close-success');
    if (btnFechar) {
        btnFechar.addEventListener('click', removerIndicador);
    }

    // Remover após 10 segundos com fade out
    setTimeout(removerIndicador, 10000);

    // Adicionar estilos de animação se não existirem
    if (!document.getElementById('nfe-extractor-styles')) {
        const style = document.createElement('style');
        style.id = 'nfe-extractor-styles';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes fadeOut {
                to {
                    opacity: 0;
                    transform: translateX(400px);
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Função para adicionar Indicador de erro
function adicionarIndicadorVisualDeErro(mensagem) {
    // Verificar se já existe
    if (document.getElementById('nfe-extractor-error-indicator')) return;

    const indicador = document.createElement('div');
    indicador.id = 'nfe-extractor-error-indicator';
    indicador.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        font-weight: 600;
        z-index: 9999999;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        animation: slideInRight 0.5s ease;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 300px;
    `;

    indicador.innerHTML = `
        <span style="font-size: 20px;">✕</span>
        <span style="flex: 1;">${mensagem || 'Erro ao enviar dados para o SmartOticas'}</span>
        <button id="nfe-close-error" style="
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'" 
           onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'">×</button>
    `;

    document.body.appendChild(indicador);

    // Função para remover o indicador
    const removerIndicador = () => {
        indicador.style.animation = 'fadeOut 0.5s ease';
        setTimeout(() => indicador.remove(), 500);
    };

    // Adicionar evento de clique no botão X
    const btnFechar = document.getElementById('nfe-close-error');
    if (btnFechar) {
        btnFechar.addEventListener('click', removerIndicador);
    }

    // Remover após 10 segundos com fade out
    setTimeout(removerIndicador, 10000);

    // Adicionar estilos de animação se não existirem
    if (!document.getElementById('nfe-extractor-styles')) {
        const style = document.createElement('style');
        style.id = 'nfe-extractor-styles';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes fadeOut {
                to {
                    opacity: 0;
                    transform: translateX(400px);
                }
            }
        `;
        document.head.appendChild(style);
    }
}


// Função para iniciar a extração dos produtos da nota fiscal
function extrairProdutosDaNota(htmlConteudo) {
    const produtos = [];
    
    try {
        // Criar um parser DOM para processar o HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlConteudo, 'text/html');
        
        // Pegar todas as tables com classe "toggle box" (dados básicos dos produtos)
        const tabelasProdutos = doc.querySelectorAll('table.toggle.box');
        
        console.log(`Encontradas ${tabelasProdutos.length} tabelas de produtos`);
        
        tabelasProdutos.forEach((tabela, index) => {
            try {
                // Extrair dados básicos da primeira table
                const numero = tabela.querySelector('.fixo-prod-serv-numero span')?.textContent?.trim() || '';
                const descricao = tabela.querySelector('.fixo-prod-serv-descricao span')?.textContent?.trim() || '';
                const quantidade = tabela.querySelector('.fixo-prod-serv-qtd span')?.textContent?.trim() || '';
                const unidade = tabela.querySelector('.fixo-prod-serv-uc span')?.textContent?.trim() || '';
                const valor = tabela.querySelector('.fixo-prod-serv-vb span')?.textContent?.trim() || '';
                
                // Buscar a próxima table com classe "toggable box" (detalhes)
                let tabelaDetalhes = tabela.nextElementSibling;
                while (tabelaDetalhes && !tabelaDetalhes.classList.contains('toggable')) {
                    tabelaDetalhes = tabelaDetalhes.nextElementSibling;
                }
                
                let codigoProduto = '';
                let codigoNCM = '';
                
                if (tabelaDetalhes) {
                    // Buscar todos os labels e spans dentro da tabela de detalhes
                    const labels = tabelaDetalhes.querySelectorAll('label');
                    const spans = tabelaDetalhes.querySelectorAll('span');
                    
                    // Procurar "Código do Produto" e "Código NCM"
                    labels.forEach((label, idx) => {
                        const textoLabel = label.textContent.trim();
                        
                        if (textoLabel === 'Código do Produto') {
                            // Pegar o próximo span após o label
                            const spanSeguinte = label.nextElementSibling;
                            if (spanSeguinte && spanSeguinte.tagName === 'SPAN') {
                                codigoProduto = spanSeguinte.textContent.trim();
                            }
                        }
                        
                        if (textoLabel === 'Código NCM') {
                            const spanSeguinte = label.nextElementSibling;
                            if (spanSeguinte && spanSeguinte.tagName === 'SPAN') {
                                codigoNCM = spanSeguinte.textContent.trim();
                            }
                        }
                    });
                }
                
                // Criar objeto do produto
                const produto = {
                    numero: numero,
                    descricao: descricao,
                    quantidade: parseFloat(quantidade.replace(',', '.')) || 0,
                    unidade: unidade,
                    valor: parseFloat(valor.replace('.', '').replace(',', '.')) || 0,
                    codigo_produto: codigoProduto,
                    codigo_ncm: codigoNCM
                };
                
                console.log(`Produto ${index + 1}:`, produto);
                produtos.push(produto);
                
            } catch (error) {
                console.error(`Erro ao extrair produto ${index + 1}:`, error);
            }
        });
        
        console.log(`Total de produtos extraídos: ${produtos.length}`);
        
    } catch (error) {
        console.error('Erro ao processar HTML dos produtos:', error);
    }
    
    return produtos;
}

// Observador para detectar quando a chave de acesso aparece
function iniciarObservadorChaveAcesso() {
    console.log('Iniciando observador de Chave de Acesso...');
    // Função para verificar o XPath específico
    const verificarXPathEspecifico = () => {
        const resultado = document.evaluate(
            '//*[@id="conteudoDinamico"]/div[3]/div[1]/fieldset/table/tbody/tr/td[1]/label',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        );

        if (resultado.singleNodeValue) {
            console.log('Label encontrado no XPath específico');
            chaveAcessoApareceu();
            return true;
        }
        return false;
    };

    // Verificar se já existe na página
    if (verificarXPathEspecifico()) {
        console.log('Chave de acesso já presente na página');
        return; // Já encontrou, não precisa observar
    }

    // Criar observer para detectar novos elementos
    const observer = new MutationObserver((mutations) => {
        if (verificarXPathEspecifico()) {
            observer.disconnect(); // Para de observar após encontrar
        }
    });

    // Configurar e iniciar observer
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log('Observer de Chave de Acesso iniciado (XPath específico)');
}

// Listener para mensagens da extensão
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Mensagem recebida:', request);

    if (request.action === 'extrairDados') {
        const dados = extrairDadosNFe();

        if (dados && dados.produtos.length > 0) {
            sendResponse({ success: true, dados: dados });
        } else {
            sendResponse({
                success: false,
                message: 'Nenhum produto encontrado. Verifique se a página da NFe está carregada completamente.'
            });
        }
    }

    return true; // Mantém o canal aberto para resposta assíncrona
});

// Executar ao carregar a página
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        alert('NFe Extractor está ativo nesta página!');
        adicionarIndicadorVisual();
        iniciarObservadorChaveAcesso();
    });
} else {
    adicionarIndicadorVisual();
    iniciarObservadorChaveAcesso();
}

console.log('NFe Extractor: Pronto para extrair dados!');