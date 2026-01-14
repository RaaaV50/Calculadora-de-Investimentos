# Calculadora CDI — Instruções de execução e acesso remoto

Este README explica como servir a pasta localmente (HTTP) e acessar a aplicação a partir de outro dispositivo na mesma rede.

Por que isso é necessário
- Abrir o arquivo diretamente (`file://`) pode bloquear o `fetch` por CORS e outras restrições. Use HTTP para testes reais.

Métodos rápidos para servir a pasta

1) Python (recomendado, já instalado em muitas máquinas)

```bash
# No Windows (PowerShell / CMD)
py -m http.server 8000
# Ou, se `python` está no PATH
python -m http.server 8000
```

2) Node.js (`http-server`)

```bash
npm install -g http-server
http-server -p 8000
```

3) VSCode — Live Server (extensão)
- Abra a pasta `Calculadora_cdi` no VS Code e clique em "Go Live" no canto inferior.

Acessar de outro dispositivo na mesma rede

1. Descubra o IP local do computador que está servindo:
   - Windows: abra `cmd` e rode `ipconfig` — use o `IPv4` da interface Wi‑Fi/Ethernet.
   - macOS/Linux: rode `ip a` ou `ifconfig`.

2. No outro dispositivo (celular, outro PC), abra no navegador:

```
http://<IP_DO_SERVIDOR>:8000
```

Exemplo: `http://192.168.1.10:8000`

Observações de rede e firewall
- Certifique-se de que ambos os dispositivos estão na mesma rede Wi‑Fi.
- Se o Windows bloquear o acesso, permita o `python`/`node` no Firewall (ou abra a porta 8000).

CORS e fetch do Banco Central (BCB)
- A API do BCB pode bloquear requisições quando acessada de origens não permitidas.
- Se o `fetch` falhar mesmo servindo via HTTP, opções:
  - Use GitHub Pages (deploy estático) — recomendado para publicações rápidas.
  - Use `ngrok` para expor localmente via HTTPS: `ngrok http 8000`.
  - Para testes locais, usar extensão que desabilita CORS (apenas para desenvolvimento).

Deploy rápido no GitHub Pages

```bash
# Na pasta do projeto
git init
git add .
git commit -m "Initial"
# Crie um repositório no GitHub e siga as instruções para empurrar
# Depois ative GitHub Pages nas configurações do repositório (branch main)
```

Depois de publicado, a URL será `https://<usuario>.github.io/<repo>/`.

Teste e depuração
- Abra o DevTools (F12) e verifique o console por erros (CORS, network).
- Verifique a aba Network para ver se a requisição ao BCB retornou 200 ou erro.

Se quiser, posso:
- Iniciar o servidor local aqui mesmo (se permitir) e mostrar instruções passo a passo.
- Gerar um pequeno script `serve.bat` ou `serve.sh` para facilitar o start.


---
Arquivo criado: `Calculadora_cdi/README.md`