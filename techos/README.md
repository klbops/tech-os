# 🔧 TechOS — Sistema de Ordens de Serviço

Sistema completo para gerenciamento de Ordens de Serviço (OS), com backend Node.js + SQLite e frontend moderno.

---

## 🚀 Como Rodar com Docker

### Pré-requisitos
- [Docker](https://docs.docker.com/get-docker/) instalado
- [Docker Compose](https://docs.docker.com/compose/install/) instalado

### Opção 1 — Docker Compose (recomendado)

```bash
# 1. Entre na pasta do projeto
cd techos

# 2. Suba a aplicação
docker-compose up -d

# 3. Acesse no navegador
# http://localhost:3000
```

### Opção 2 — Docker puro

```bash
# Build da imagem
docker build -t techos .

# Rodar o container
docker run -d \
  --name techos-app \
  -p 3000:3000 \
  -v techos-data:/data \
  --restart unless-stopped \
  techos

# Acesse: http://localhost:3000
```

---

## 📋 Comandos Úteis

```bash
# Ver logs em tempo real
docker-compose logs -f

# Parar a aplicação
docker-compose down

# Parar e remover os dados (banco de dados)
docker-compose down -v

# Rebuildar após mudanças no código
docker-compose up -d --build

# Acessar o container
docker exec -it techos-app sh

# Backup do banco de dados
docker cp techos-app:/data/techos.db ./backup-$(date +%Y%m%d).db
```

---

## 🌐 API Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/dashboard` | Estatísticas gerais |
| GET | `/api/os` | Listar OS (suporta ?status=, ?search=) |
| POST | `/api/os` | Criar nova OS |
| PUT | `/api/os/:id` | Atualizar OS |
| DELETE | `/api/os/:id` | Excluir OS |
| GET | `/api/os/:id/pdf` | Gerar PDF da OS |
| GET | `/api/os/export/csv` | Exportar todas em CSV |
| GET | `/api/clientes` | Listar clientes |
| POST | `/api/clientes` | Criar cliente |
| PUT | `/api/clientes/:id` | Atualizar cliente |
| DELETE | `/api/clientes/:id` | Excluir cliente |
| GET | `/api/tecnicos` | Listar técnicos |
| POST | `/api/tecnicos` | Criar técnico |
| PUT | `/api/tecnicos/:id` | Atualizar técnico |
| DELETE | `/api/tecnicos/:id` | Excluir técnico |
| GET | `/api/tipos-servico` | Listar tipos de serviço |
| POST | `/api/tipos-servico` | Criar tipo de serviço |

---

## ✨ Funcionalidades

- ✅ **Dashboard** com estatísticas, gráficos de prioridade e ranking de técnicos
- ✅ **CRUD completo** de OS, clientes, técnicos e tipos de serviço
- ✅ **Filtros e busca** em tempo real na listagem de OS
- ✅ **Geração de PDF** para cada OS (laudo técnico, assinaturas)
- ✅ **Exportação CSV** de todas as OS
- ✅ **Histórico de alterações** por OS
- ✅ **Banco de dados SQLite** persistido em volume Docker
- ✅ **Healthcheck** automático
- ✅ **Dados de exemplo** inseridos automaticamente no primeiro start

---

## 🗂️ Estrutura do Projeto

```
techos/
├── backend/
│   ├── server.js        # API Express + SQLite
│   └── package.json
├── frontend/
│   └── public/
│       └── index.html   # SPA completo
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## 🔧 Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3000` | Porta do servidor |
| `DB_PATH` | `/data/techos.db` | Caminho do banco SQLite |
| `NODE_ENV` | `production` | Ambiente |

---

## 💾 Persistência dos Dados

O banco de dados SQLite fica salvo no volume Docker `techos-data`.
Para fazer backup:

```bash
docker cp techos-app:/data/techos.db ./meu-backup.db
```

Para restaurar:
```bash
docker cp ./meu-backup.db techos-app:/data/techos.db
docker-compose restart
```
