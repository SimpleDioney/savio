# Sistema de Gerenciamento de Tarefas

Um sistema web completo para gerenciamento de tarefas e funcionários em múltiplas lojas, com controle de horários, folgas e relatórios.

## 🚀 Funcionalidades

### Gestão de Funcionários
- Cadastro e gerenciamento de funcionários
- Definição de horários de trabalho
- Controle de folgas
- Vinculação com lojas
- Visualização de status (trabalhando, folga, fora de expediente)

### Gestão de Tarefas
- Criação de tarefas fixas e diárias
- Distribuição automática de tarefas
- Acompanhamento de status (pendente, em andamento, concluído)
- Priorização de tarefas
- Histórico de execução

### Gestão de Lojas
- Cadastro e gerenciamento de lojas
- Endereço e informações de contato
- Associação de funcionários
- Monitoramento de atividades por loja

### Sistema de Folgas
- Agendamento de folgas
- Calendário visual de folgas
- Gestão de disponibilidade de equipe
- Histórico de folgas por funcionário

### Relatórios e Analytics
- Relatórios diários, semanais e mensais
- Métricas de produtividade
- Taxa de conclusão de tarefas
- Análise de desempenho por funcionário
- Estatísticas por loja

### Segurança
- Autenticação JWT
- Níveis de acesso (admin/funcionário)
- Proteção de rotas
- Validação de horários de trabalho

## 🛠️ Tecnologias Utilizadas

### Backend
- Node.js
- Express
- SQLite3
- JWT para autenticação
- BCrypt para criptografia

### Frontend
- HTML5
- CSS3
- JavaScript vanilla
- Layout responsivo
- Tema escuro

## 📦 Estrutura do Banco de Dados

### Tabelas
- `users`: Informações de login e autenticação
- `employees`: Dados dos funcionários
- `tasks`: Registro de tarefas
- `stores`: Cadastro de lojas
- `leaves`: Controle de folgas
- `task_history`: Histórico de execução
- `fixed_task_status`: Status de tarefas fixas

## 👥 Usuários e Permissões

### Administrador
- Acesso total ao sistema
- Gerenciamento de funcionários
- Criação e edição de lojas
- Gestão de folgas
- Visualização de relatórios

### Funcionário
- Visualização e execução de tarefas
- Atualização de status de tarefas
- Visualização de própria escala
- Consulta de folgas

## 📱 Responsividade

O sistema é totalmente responsivo e funciona em:
- Desktops
- Tablets
- Smartphones

## 🎨 Temas e Cores

O sistema utiliza um tema escuro com as seguintes cores principais:
```css
--bg-primary: #1a1a1a
--bg-secondary: #2d2d2d
--text-primary: #ffffff
--text-secondary: #b3b3b3
--accent: #007bff
--success: #28a745
--danger: #dc3545
--warning: #ffc107
```

## 📊 APIs Disponíveis

### Autenticação
- `POST /api/login`: Login de usuário
- `GET /api/users/check/:username`: Verificar disponibilidade de username

### Funcionários
- `GET /api/employees`: Listar funcionários
- `POST /api/employees`: Criar funcionário
- `PUT /api/employees/:id`: Atualizar funcionário
- `DELETE /api/employees/:id`: Remover funcionário

### Tarefas
- `GET /api/tasks`: Listar tarefas
- `POST /api/tasks`: Criar tarefa
- `PATCH /api/tasks/:id/status`: Atualizar status
- `DELETE /api/tasks/:id`: Remover tarefa

### Lojas
- `GET /api/stores`: Listar lojas
- `POST /api/stores`: Criar loja
- `PUT /api/stores/:id`: Atualizar loja
- `DELETE /api/stores/:id`: Remover loja

### Folgas
- `GET /api/leaves`: Listar folgas
- `POST /api/leaves`: Criar folga
- `DELETE /api/leaves/:id`: Remover folga

### Relatórios
- `GET /api/reports`: Gerar relatórios

## 💡 Funcionalidades Avançadas

### Distribuição Automática de Tarefas
O sistema considera:
- Carga atual de trabalho
- Histórico de tarefas
- Horário de trabalho
- Folgas agendadas
- Prioridade das tarefas

### Monitoramento em Tempo Real
- Status dos funcionários
- Progresso das tarefas
- Alertas de atrasos
- Notificações de conclusão

## 🔍 Monitoramento e Debug

O sistema inclui logs detalhados para:
- Erros de autenticação
- Falhas nas operações
- Distribuição de tarefas
- Alterações no banco de dados

## 📝 Notas de Versão

### v1.7.0
- Sistema base de gerenciamento de tarefas
- Autenticação e autorização
- CRUD de funcionários e lojas
- Sistema de folgas
- Relatórios básicos

## 📄 Empresa

Este projeto foi feito exclusivamente para a empresa Sávio.
