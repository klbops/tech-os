const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || '/data/techos.db';
const JWT_SECRET = process.env.JWT_SECRET || 'techos-secret-mude-em-producao-2024';
const JWT_EXPIRES = '8h';

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ============================================================
// DATABASE SETUP
// ============================================================
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    perfil TEXT DEFAULT 'operador' CHECK(perfil IN ('admin','operador','tecnico')),
    ativo INTEGER DEFAULT 1,
    ultimo_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, telefone TEXT, email TEXT, cpf_cnpj TEXT, endereco TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tecnicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, especialidade TEXT, telefone TEXT, email TEXT,
    ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tipos_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, descricao TEXT, valor_base REAL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    cliente_id INTEGER REFERENCES clientes(id),
    tecnico_id INTEGER REFERENCES tecnicos(id),
    tipo_servico_id INTEGER REFERENCES tipos_servico(id),
    status TEXT DEFAULT 'Aberta' CHECK(status IN ('Aberta','Em Andamento','Concluida','Cancelada')),
    prioridade TEXT DEFAULT 'Media' CHECK(prioridade IN ('Baixa','Media','Alta')),
    equipamento TEXT, numero_serie TEXT, descricao TEXT, observacoes TEXT, laudo TEXT,
    valor_pecas REAL DEFAULT 0, valor_mao_obra REAL DEFAULT 0,
    prazo DATE, data_conclusao DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS historico_os (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    os_id INTEGER REFERENCES ordens_servico(id) ON DELETE CASCADE,
    acao TEXT NOT NULL, descricao TEXT, usuario TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TRIGGER IF NOT EXISTS update_os_ts AFTER UPDATE ON ordens_servico
    BEGIN UPDATE ordens_servico SET updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END;
`);

// Verifica se colunas com acento existem (compatibilidade), senão usa sem acento
const colStatus = db.prepare("PRAGMA table_info(ordens_servico)").all().find(c => c.name === 'status');

// Seed admin
if (!db.prepare('SELECT id FROM usuarios WHERE email=?').get('admin@techos.com')) {
  db.prepare('INSERT INTO usuarios (nome,email,senha_hash,perfil) VALUES (?,?,?,?)').run('Administrador','admin@techos.com',bcrypt.hashSync('admin123',10),'admin');
  console.log('👤 Admin criado: admin@techos.com / admin123');
}

// Seed dados
if (!db.prepare('SELECT COUNT(*) as c FROM clientes').get().c) {
  db.exec(`
    INSERT INTO clientes (nome,telefone,email,cpf_cnpj) VALUES
      ('Joao Silva','(11) 98765-4321','joao@email.com','123.456.789-00'),
      ('Maria Fernanda','(21) 91234-5678','maria@email.com','987.654.321-00'),
      ('Tech Solutions Ltda','(11) 3333-4444','ti@techsol.com.br','12.345.678/0001-99'),
      ('Carlos Mendes','(85) 99876-1234','carlos@gmail.com','111.222.333-44'),
      ('Empresa ABC','(31) 3123-4567','suporte@abc.com.br','98.765.432/0001-10');
    INSERT INTO tecnicos (nome,especialidade,telefone) VALUES
      ('Rafael Oliveira','Hardware','(11) 91111-2222'),
      ('Amanda Costa','Software / SO','(11) 93333-4444'),
      ('Lucas Pereira','Redes','(11) 95555-6666'),
      ('Fernanda Lima','Full Stack','(11) 97777-8888');
    INSERT INTO tipos_servico (nome,valor_base) VALUES
      ('Formatacao / Reinstalacao OS',150),('Limpeza e Manutencao',80),
      ('Troca de HD / SSD',120),('Reparo de Placa',200),
      ('Instalacao de Programas',60),('Configuracao de Rede',100),
      ('Backup de Dados',80),('Substituicao de Tela',180),
      ('Configuracao de Email',50),('Outros',0);
    INSERT INTO ordens_servico (numero,cliente_id,tecnico_id,tipo_servico_id,status,prioridade,equipamento,numero_serie,descricao,valor_pecas,valor_mao_obra,prazo) VALUES
      ('0001',1,1,1,'Em Andamento','Alta','Notebook Dell Inspiron','DL-20981','Computador travando, solicitou formatacao completa',0,150,date('now','+3 days')),
      ('0002',2,2,3,'Aberta','Media','MacBook Pro 2019','MAC-8821','HD com setores defeituosos, cliente quer upgrade para SSD',450,120,date('now','+6 days')),
      ('0003',3,3,6,'Aberta','Alta','Servidor HP ProLiant','HP-00123','Configurar VPN corporativa e firewall',0,500,date('now','+1 days')),
      ('0004',4,4,2,'Concluida','Baixa','Desktop Positivo','PS-4512','Limpeza geral e troca de pasta termica',15,80,date('now','-2 days')),
      ('0005',5,2,7,'Concluida','Media','Servidor NAS','NAS-777','Configurar rotina de backup automatico',0,350,date('now','-5 days'));
    INSERT INTO historico_os (os_id,acao,descricao,usuario) VALUES
      (1,'Criacao','OS criada','Sistema'),(1,'Status','Status alterado para Em Andamento','Sistema'),
      (2,'Criacao','OS criada','Sistema'),(3,'Criacao','OS criada','Sistema'),
      (4,'Criacao','OS criada','Sistema'),(4,'Conclusao','OS concluida','Sistema'),
      (5,'Criacao','OS criada','Sistema'),(5,'Conclusao','OS concluida','Sistema');
  `);
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Nao autenticado' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token invalido ou expirado' }); }
}
function adminOnly(req, res, next) {
  if (req.user?.perfil !== 'admin') return res.status(403).json({ error: 'Acesso apenas para administradores' });
  next();
}

// ============================================================
// ROUTES — AUTH
// ============================================================
app.post('/api/auth/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'Email e senha obrigatorios' });
  const user = db.prepare('SELECT * FROM usuarios WHERE email=? AND ativo=1').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(senha, user.senha_hash))
    return res.status(401).json({ error: 'Email ou senha incorretos' });
  db.prepare('UPDATE usuarios SET ultimo_login=CURRENT_TIMESTAMP WHERE id=?').run(user.id);
  const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email, perfil: user.perfil }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil } });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json(db.prepare('SELECT id,nome,email,perfil,ultimo_login FROM usuarios WHERE id=?').get(req.user.id));
});

app.put('/api/auth/senha', auth, (req, res) => {
  const { senha_atual, senha_nova } = req.body;
  const user = db.prepare('SELECT * FROM usuarios WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(senha_atual, user.senha_hash)) return res.status(400).json({ error: 'Senha atual incorreta' });
  db.prepare('UPDATE usuarios SET senha_hash=? WHERE id=?').run(bcrypt.hashSync(senha_nova, 10), req.user.id);
  res.json({ ok: true });
});

// ============================================================
// ROUTES — USUARIOS (admin)
// ============================================================
app.get('/api/usuarios', auth, adminOnly, (req, res) => {
  res.json(db.prepare('SELECT id,nome,email,perfil,ativo,ultimo_login,created_at FROM usuarios ORDER BY nome').all());
});
app.post('/api/usuarios', auth, adminOnly, (req, res) => {
  const { nome, email, senha, perfil } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ error: 'Nome, email e senha obrigatorios' });
  if (db.prepare('SELECT id FROM usuarios WHERE email=?').get(email)) return res.status(400).json({ error: 'Email ja cadastrado' });
  const r = db.prepare('INSERT INTO usuarios (nome,email,senha_hash,perfil) VALUES (?,?,?,?)').run(nome, email.toLowerCase(), bcrypt.hashSync(senha, 10), perfil||'operador');
  res.json(db.prepare('SELECT id,nome,email,perfil,ativo FROM usuarios WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/usuarios/:id', auth, adminOnly, (req, res) => {
  const { nome, email, perfil, ativo, senha } = req.body;
  if (senha) db.prepare('UPDATE usuarios SET nome=?,email=?,perfil=?,ativo=?,senha_hash=? WHERE id=?').run(nome,email,perfil,ativo??1,bcrypt.hashSync(senha,10),req.params.id);
  else db.prepare('UPDATE usuarios SET nome=?,email=?,perfil=?,ativo=? WHERE id=?').run(nome,email,perfil,ativo??1,req.params.id);
  res.json(db.prepare('SELECT id,nome,email,perfil,ativo FROM usuarios WHERE id=?').get(req.params.id));
});
app.delete('/api/usuarios/:id', auth, adminOnly, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Nao e possivel excluir sua propria conta' });
  db.prepare('DELETE FROM usuarios WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// HELPERS
// ============================================================
function nextNum() {
  const r = db.prepare('SELECT numero FROM ordens_servico ORDER BY CAST(numero AS INTEGER) DESC LIMIT 1').get();
  return String((r ? parseInt(r.numero) : 0) + 1).padStart(4, '0');
}
const getOS = id => db.prepare(`
  SELECT os.*, c.nome as cliente_nome, c.telefone as cliente_tel, c.email as cliente_email, c.cpf_cnpj,
    t.nome as tecnico_nome, ts.nome as tipo_nome
  FROM ordens_servico os
  LEFT JOIN clientes c ON os.cliente_id=c.id
  LEFT JOIN tecnicos t ON os.tecnico_id=t.id
  LEFT JOIN tipos_servico ts ON os.tipo_servico_id=ts.id
  WHERE os.id=?`).get(id);

// ============================================================
// ROUTES — CLIENTES
// ============================================================
app.get('/api/clientes', auth, (req, res) => res.json(db.prepare('SELECT * FROM clientes ORDER BY nome').all()));
app.post('/api/clientes', auth, (req, res) => {
  const { nome, telefone, email, cpf_cnpj, endereco } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obrigatorio' });
  const r = db.prepare('INSERT INTO clientes (nome,telefone,email,cpf_cnpj,endereco) VALUES (?,?,?,?,?)').run(nome,telefone||'',email||'',cpf_cnpj||'',endereco||'');
  res.json(db.prepare('SELECT * FROM clientes WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/clientes/:id', auth, (req, res) => {
  const { nome, telefone, email, cpf_cnpj, endereco } = req.body;
  db.prepare('UPDATE clientes SET nome=?,telefone=?,email=?,cpf_cnpj=?,endereco=? WHERE id=?').run(nome,telefone,email,cpf_cnpj,endereco,req.params.id);
  res.json(db.prepare('SELECT * FROM clientes WHERE id=?').get(req.params.id));
});
app.delete('/api/clientes/:id', auth, (req, res) => { db.prepare('DELETE FROM clientes WHERE id=?').run(req.params.id); res.json({ok:true}); });

// ============================================================
// ROUTES — TECNICOS
// ============================================================
app.get('/api/tecnicos', auth, (req, res) => res.json(db.prepare('SELECT * FROM tecnicos ORDER BY nome').all()));
app.post('/api/tecnicos', auth, (req, res) => {
  const { nome, especialidade, telefone, email } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obrigatorio' });
  const r = db.prepare('INSERT INTO tecnicos (nome,especialidade,telefone,email) VALUES (?,?,?,?)').run(nome,especialidade||'',telefone||'',email||'');
  res.json(db.prepare('SELECT * FROM tecnicos WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/tecnicos/:id', auth, (req, res) => {
  const { nome, especialidade, telefone, email, ativo } = req.body;
  db.prepare('UPDATE tecnicos SET nome=?,especialidade=?,telefone=?,email=?,ativo=? WHERE id=?').run(nome,especialidade,telefone,email,ativo??1,req.params.id);
  res.json(db.prepare('SELECT * FROM tecnicos WHERE id=?').get(req.params.id));
});
app.delete('/api/tecnicos/:id', auth, (req, res) => { db.prepare('DELETE FROM tecnicos WHERE id=?').run(req.params.id); res.json({ok:true}); });

// ============================================================
// ROUTES — TIPOS SERVICO
// ============================================================
app.get('/api/tipos-servico', auth, (req, res) => res.json(db.prepare('SELECT * FROM tipos_servico ORDER BY nome').all()));
app.post('/api/tipos-servico', auth, (req, res) => {
  const { nome, descricao, valor_base } = req.body;
  const r = db.prepare('INSERT INTO tipos_servico (nome,descricao,valor_base) VALUES (?,?,?)').run(nome,descricao||'',valor_base||0);
  res.json(db.prepare('SELECT * FROM tipos_servico WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/tipos-servico/:id', auth, (req, res) => {
  const { nome, descricao, valor_base } = req.body;
  db.prepare('UPDATE tipos_servico SET nome=?,descricao=?,valor_base=? WHERE id=?').run(nome,descricao||'',valor_base||0,req.params.id);
  res.json(db.prepare('SELECT * FROM tipos_servico WHERE id=?').get(req.params.id));
});

// ============================================================
// ROUTES — OS
// ============================================================
app.get('/api/os', auth, (req, res) => {
  const { status, search } = req.query;
  let sql = `SELECT os.*, c.nome as cliente_nome, t.nome as tecnico_nome, ts.nome as tipo_nome,
    (os.valor_pecas+os.valor_mao_obra) as total
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id=c.id
    LEFT JOIN tecnicos t ON os.tecnico_id=t.id
    LEFT JOIN tipos_servico ts ON os.tipo_servico_id=ts.id WHERE 1=1`;
  const p = [];
  if (status && status !== 'all') { sql += ' AND os.status=?'; p.push(status); }
  if (search) { sql += ' AND (c.nome LIKE ? OR os.numero LIKE ? OR ts.nome LIKE ? OR os.equipamento LIKE ?)'; const s=`%${search}%`; p.push(s,s,s,s); }
  sql += ' ORDER BY os.created_at DESC';
  res.json(db.prepare(sql).all(...p));
});

app.get('/api/os/:id', auth, (req, res) => {
  const os = getOS(req.params.id);
  if (!os) return res.status(404).json({ error: 'OS nao encontrada' });
  const historico = db.prepare('SELECT * FROM historico_os WHERE os_id=? ORDER BY created_at DESC').all(os.id);
  res.json({ ...os, historico });
});

app.post('/api/os', auth, (req, res) => {
  const { cliente_id, tecnico_id, tipo_servico_id, status, prioridade, equipamento, numero_serie, descricao, observacoes, valor_pecas, valor_mao_obra, prazo } = req.body;
  if (!cliente_id || !descricao) return res.status(400).json({ error: 'Cliente e descricao obrigatorios' });
  const numero = nextNum();
  const r = db.prepare(`INSERT INTO ordens_servico (numero,cliente_id,tecnico_id,tipo_servico_id,status,prioridade,equipamento,numero_serie,descricao,observacoes,valor_pecas,valor_mao_obra,prazo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(numero,cliente_id,tecnico_id||null,tipo_servico_id||null,status||'Aberta',prioridade||'Media',equipamento||'',numero_serie||'',descricao,observacoes||'',valor_pecas||0,valor_mao_obra||0,prazo||null);
  db.prepare('INSERT INTO historico_os (os_id,acao,descricao,usuario) VALUES (?,?,?,?)').run(r.lastInsertRowid,'Criacao','OS criada',req.user.nome);
  res.json(getOS(r.lastInsertRowid));
});

app.put('/api/os/:id', auth, (req, res) => {
  const old = db.prepare('SELECT status FROM ordens_servico WHERE id=?').get(req.params.id);
  const { cliente_id, tecnico_id, tipo_servico_id, status, prioridade, equipamento, numero_serie, descricao, observacoes, laudo, valor_pecas, valor_mao_obra, prazo } = req.body;
  db.prepare(`UPDATE ordens_servico SET cliente_id=?,tecnico_id=?,tipo_servico_id=?,status=?,prioridade=?,
    equipamento=?,numero_serie=?,descricao=?,observacoes=?,laudo=?,valor_pecas=?,valor_mao_obra=?,prazo=?,
    data_conclusao=CASE WHEN ?='Concluida' AND status!='Concluida' THEN CURRENT_TIMESTAMP ELSE data_conclusao END
    WHERE id=?`).run(cliente_id,tecnico_id||null,tipo_servico_id||null,status,prioridade,equipamento||'',numero_serie||'',descricao,observacoes||'',laudo||'',valor_pecas||0,valor_mao_obra||0,prazo||null,status,req.params.id);
  if (old && old.status !== status)
    db.prepare('INSERT INTO historico_os (os_id,acao,descricao,usuario) VALUES (?,?,?,?)').run(req.params.id,'Status',`De "${old.status}" para "${status}"`,req.user.nome);
  res.json(getOS(req.params.id));
});

app.delete('/api/os/:id', auth, (req, res) => { db.prepare('DELETE FROM ordens_servico WHERE id=?').run(req.params.id); res.json({ok:true}); });

// ============================================================
// ROUTE — DASHBOARD
// ============================================================
app.get('/api/dashboard', auth, (req, res) => {
  const stats = db.prepare(`SELECT COUNT(*) as total,
    SUM(CASE WHEN status='Aberta' THEN 1 ELSE 0 END) as abertas,
    SUM(CASE WHEN status='Em Andamento' THEN 1 ELSE 0 END) as andamento,
    SUM(CASE WHEN status='Concluida' THEN 1 ELSE 0 END) as concluidas,
    SUM(CASE WHEN status='Cancelada' THEN 1 ELSE 0 END) as canceladas,
    SUM(CASE WHEN status='Concluida' THEN (valor_pecas+valor_mao_obra) ELSE 0 END) as receita_total,
    SUM(CASE WHEN status IN ('Aberta','Em Andamento') THEN (valor_pecas+valor_mao_obra) ELSE 0 END) as receita_pendente
    FROM ordens_servico`).get();
  const porPrioridade = db.prepare(`SELECT prioridade, COUNT(*) as total FROM ordens_servico WHERE status IN ('Aberta','Em Andamento') GROUP BY prioridade`).all();
  const recentes = db.prepare(`SELECT os.id,os.numero,os.status,os.prioridade,os.created_at,
    c.nome as cliente_nome,ts.nome as tipo_nome,t.nome as tecnico_nome
    FROM ordens_servico os LEFT JOIN clientes c ON os.cliente_id=c.id
    LEFT JOIN tipos_servico ts ON os.tipo_servico_id=ts.id LEFT JOIN tecnicos t ON os.tecnico_id=t.id
    ORDER BY os.created_at DESC LIMIT 8`).all();
  const porTecnico = db.prepare(`SELECT t.nome, COUNT(*) as total,
    SUM(CASE WHEN os.status='Concluida' THEN 1 ELSE 0 END) as concluidas
    FROM ordens_servico os JOIN tecnicos t ON os.tecnico_id=t.id GROUP BY t.id ORDER BY total DESC LIMIT 5`).all();
  res.json({ stats, porPrioridade, recentes, porTecnico });
});

// ============================================================
// ROUTE — PDF
// ============================================================
app.get('/api/os/:id/pdf', auth, (req, res) => {
  const os = getOS(req.params.id);
  if (!os) return res.status(404).json({ error: 'OS nao encontrada' });
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=OS-${os.numero}.pdf`);
  doc.pipe(res);
  doc.rect(0, 0, 612, 80).fill('#1a1f2e');
  doc.fill('#ffffff').fontSize(22).font('Helvetica-Bold').text('TechOS', 50, 22);
  doc.fontSize(10).font('Helvetica').fill('#8892a4').text('Sistema de Ordens de Servico', 50, 48);
  doc.fill('#3b82f6').fontSize(14).font('Helvetica-Bold').text(`OS #${os.numero}`, 450, 28, { align: 'right', width: 110 });
  doc.fill('#8892a4').fontSize(9).font('Helvetica').text(new Date(os.created_at).toLocaleDateString('pt-BR'), 450, 50, { align: 'right', width: 110 });
  const drawBox = (x, y, w, h, title, lines) => {
    doc.rect(x, y, w, h).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.fill('#64748b').fontSize(8).font('Helvetica-Bold').text(title, x+10, y+10);
    doc.fill('#1e293b').fontSize(10).font('Helvetica');
    lines.forEach((l, i) => { if (l) doc.text(l, x+10, y+24+(i*15), { width: w-20 }); });
  };
  const y0=110;
  drawBox(50,y0,250,80,'CLIENTE',[os.cliente_nome,os.cliente_tel||'',os.cliente_email||'',os.cpf_cnpj||'']);
  drawBox(315,y0,247,80,'ORDEM DE SERVICO',[`Numero: #${os.numero}`,`Data: ${new Date(os.created_at).toLocaleDateString('pt-BR')}`,`Prazo: ${os.prazo?new Date(os.prazo+'T12:00').toLocaleDateString('pt-BR'):'--'}`]);
  const y1=y0+95;
  drawBox(50,y1,120,60,'STATUS',[os.status]);
  drawBox(185,y1,120,60,'PRIORIDADE',[os.prioridade]);
  drawBox(320,y1,242,60,'TECNICO',[os.tecnico_nome||'Nao atribuido']);
  const y2=y1+75;
  drawBox(50,y2,512,50,'EQUIPAMENTO',[`${os.equipamento||'--'}  |  S/N: ${os.numero_serie||'--'}`]);
  const y3=y2+65;
  const descH=Math.max(70,Math.ceil((os.descricao||'').length/85)*14+40);
  drawBox(50,y3,512,descH,'DESCRICAO DO PROBLEMA',[os.descricao]);
  if(os.observacoes) drawBox(50,y3+descH+10,512,60,'OBSERVACOES',[os.observacoes]);
  if(os.laudo){const y5=y3+descH+(os.observacoes?80:10);const lh=Math.max(70,Math.ceil(os.laudo.length/85)*14+40);drawBox(50,y5,512,lh,'LAUDO TECNICO',[os.laudo]);}
  doc.moveDown(2);
  const yf=doc.y+10;
  doc.rect(50,yf,512,100).fillAndStroke('#f0fdf4','#bbf7d0');
  doc.fill('#166534').fontSize(10).font('Helvetica-Bold').text('RESUMO FINANCEIRO',60,yf+12);
  doc.fill('#374151').font('Helvetica').fontSize(10);
  doc.text('Valor das Pecas:',60,yf+30);doc.text(`R$ ${(+os.valor_pecas||0).toFixed(2).replace('.',',')}`,200,yf+30);
  doc.text('Mao de Obra:',60,yf+48);doc.text(`R$ ${(+os.valor_mao_obra||0).toFixed(2).replace('.',',')}`,200,yf+48);
  doc.rect(50,yf+65,512,1).fill('#bbf7d0');
  doc.fill('#166534').fontSize(13).font('Helvetica-Bold').text('TOTAL:',60,yf+72);
  doc.text(`R$ ${((+os.valor_pecas||0)+(+os.valor_mao_obra||0)).toFixed(2).replace('.',',')}`,200,yf+72);
  const yas=doc.page.height-120;
  doc.moveTo(60,yas).lineTo(240,yas).stroke('#cbd5e1');doc.moveTo(370,yas).lineTo(550,yas).stroke('#cbd5e1');
  doc.fill('#64748b').fontSize(9).font('Helvetica').text('Assinatura do Cliente',80,yas+5);doc.text('Assinatura do Tecnico',390,yas+5);
  doc.rect(0,doc.page.height-35,612,35).fill('#1a1f2e');
  doc.fill('#64748b').fontSize(8).text(`TechOS -- Emitido em ${new Date().toLocaleString('pt-BR')}`,50,doc.page.height-22);
  doc.end();
});

// ============================================================
// ROUTE — CSV
// ============================================================
app.get('/api/os/export/csv', auth, (req, res) => {
  const rows = db.prepare(`SELECT os.numero,os.created_at,c.nome as cliente,ts.nome as servico,
    t.nome as tecnico,os.status,os.prioridade,os.equipamento,os.prazo,os.valor_pecas,os.valor_mao_obra,
    (os.valor_pecas+os.valor_mao_obra) as total FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id=c.id LEFT JOIN tecnicos t ON os.tecnico_id=t.id
    LEFT JOIN tipos_servico ts ON os.tipo_servico_id=ts.id ORDER BY os.created_at DESC`).all();
  const headers=['No OS','Data','Cliente','Servico','Tecnico','Status','Prioridade','Equipamento','Prazo','Valor Pecas','Mao de Obra','Total'];
  const csv=[headers,...rows.map(r=>[r.numero,new Date(r.created_at).toLocaleDateString('pt-BR'),r.cliente||'',r.servico||'',r.tecnico||'',r.status,r.prioridade,r.equipamento||'',r.prazo||'',r.valor_pecas,r.valor_mao_obra,r.total])].map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename=ordens_servico.csv');
  res.send('\uFEFF'+csv);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/public/index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`🔧 TechOS em http://0.0.0.0:${PORT}`));
