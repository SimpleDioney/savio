let employees = [];
      let currentUser = null;
      let stores = [];
      let currentStoreFilter = "";

      // Inicialização
      async function init() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    try {
        currentUser = JSON.parse(atob(token.split('.')[1]));
        if (!currentUser.isAdmin) {
            window.location.href = '/';
            return;
        }

        // Carregar lojas primeiro
        await loadStores();
        // Depois carregar funcionários
        await loadEmployees();
        
        setupEventListeners();
        
        // Definir valores padrão para datas
        document.getElementById('reportDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('calendarMonth').value = new Date().toISOString().slice(0, 7);
        
        // Atualizar todos os selects de loja
        updateStoreSelects();
    } catch (error) {
        logout();
    }
}
      
async function loadLeaveRequests() {
    try {
        const currentMonth = document.getElementById('calendarMonth').value || 
                           new Date().toISOString().slice(0, 7);
                           
        const response = await fetch(`/api/leave-requests?month=${currentMonth}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) throw new Error('Erro ao carregar solicitações');
        
        const requests = await response.json();
        const container = document.getElementById('leaveRequests');
        
        if (requests.length === 0) {
            container.innerHTML = '<p>Nenhuma solicitação pendente</p>';
            return;
        }
        
        container.innerHTML = requests
            .filter(req => req.status === 'pending') // Mostrar apenas pendentes
            .map(req => `
                <div class="request-card">
                    <div class="request-info">
                        <div class="request-employee">
                            <strong>${req.employeeName}</strong>
                        </div>
                        <div class="request-dates">
                            ${req.dates.map(date => {
                                // Criar a data com o timezone local
                                const localDate = new Date(date + 'T00:00:00');
                                return localDate.toLocaleDateString('pt-BR', {
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'long'
                                });
                            }).join('<br>')}
                        </div>
                        <div class="request-status">
                            Status: ${formatRequestStatus(req.status)}
                        </div>
                    </div>
                    <div class="request-actions">
                        <button class="btn btn-success" 
                                onclick="approveLeaveRequest(${req.id})">
                            Aprovar
                        </button>
                        <button class="btn btn-danger" 
                                onclick="rejectLeaveRequest(${req.id})">
                            Rejeitar
                        </button>
                    </div>
                </div>
            `).join('');
        
    } catch (error) {
        showNotification('Erro ao carregar solicitações', 'error');
    }
}

function formatRequestStatus(status) {
    const statusMap = {
        'pending': 'Pendente',
        'approved': 'Aprovada',
        'rejected': 'Rejeitada'
    };
    return statusMap[status] || status;
}

// Dentro de setupEventListeners
document.getElementById('calendarMonth')
    .addEventListener('change', async (e) => {
        await Promise.all([
            updateLeavesCalendar(),
            loadLeaveRequests()
        ]);
    });

async function approveLeaveRequest(requestId) {
    try {
        const response = await fetch(`/api/leave-requests/${requestId}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) throw new Error('Erro ao aprovar solicitação');
        
        showNotification('Solicitação aprovada com sucesso', 'success');
        await loadLeaveRequests();
    } catch (error) {
        
        showNotification('Erro ao aprovar solicitação', 'error');
    }
}

async function rejectLeaveRequest(requestId) {
    if (!confirm('Tem certeza que deseja rejeitar esta solicitação?')) return;

    try {
        const response = await fetch(`/api/leave-requests/${requestId}/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) throw new Error('Erro ao rejeitar solicitação');
        const result = await response.json();
        
        showNotification('Solicitação rejeitada com sucesso', 'success');
        await loadLeaveRequests();
        await updateLeavesCalendar(); // Atualizar calendário após rejeição
    } catch (error) {
        
        showNotification('Erro ao rejeitar solicitação', 'error');
    }
}

      // Carregar lojas
      async function loadStores() {
        try {
          const response = await fetch("/api/stores", {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) throw new Error("Erro ao carregar lojas");

          stores = await response.json();
          updateStoresList();
          updateStoreSelects();
        } catch (error) {
          
          showNotification("Erro ao carregar lojas", "error");
        }
      }

      // Atualizar lista de lojas
      function updateStoresList() {
        const list = document.getElementById("storesList");
        list.innerHTML = stores
          .map(
            (store) => `
        <div class="store-card">
            <div class="store-info">
                <div class="store-name">${store.name}</div>
                <div class="store-details">
                    ${store.address ? `<div>📍 ${store.address}</div>` : ""}
                    ${store.phone ? `<div>📞 ${store.phone}</div>` : ""}
                </div>
            </div>
            <div class="store-actions">
                <button onclick="editStore(${store.id})" class="btn">
                    Editar
                </button>
                <button onclick="deleteStore(${
                  store.id
                })" class="btn btn-danger">
                    Remover
                </button>
            </div>
        </div>
    `
          )
          .join("");
      }

      // Atualizar selects de lojas
      function updateStoreSelects() {
    // Array com IDs de todos os selects que precisam ser atualizados
    const selectIds = ['employeeStore', 'filterStore', 'reportStore'];
    
    selectIds.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            // Valor padrão apropriado para cada select
            const defaultOption = id === 'employeeStore' ? 
                '<option value="">Selecione uma loja</option>' : 
                '<option value="">Todas as Lojas</option>';
            
            select.innerHTML = defaultOption + stores
                .filter(store => store.active)
                .map(store => `
                    <option value="${store.id}">${store.name}</option>
                `).join('');
        }
    });
}

      // Adicionar loja
      async function addStore(event) {
        event.preventDefault();

        const name = document.getElementById("storeName").value;
        const address = document.getElementById("storeAddress").value;
        const phone = document.getElementById("storePhone").value;

        try {
          const response = await fetch("/api/stores", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({ name, address, phone }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Erro ao criar loja");
          }

          showNotification("Loja adicionada com sucesso", "success");
          event.target.reset();
          await loadStores();
        } catch (error) {
          
          showNotification(error.message, "error");
        }
      }

      // Editar loja
      async function editStore(id) {
        try {
          const store = stores.find((s) => s.id === id);
          if (!store) return;

          const newName = prompt("Novo nome:", store.name);
          const newAddress = prompt("Novo endereço:", store.address);
          const newPhone = prompt("Novo telefone:", store.phone);

          if (!newName) return;

          const response = await fetch(`/api/stores/${id}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({
              name: newName,
              address: newAddress,
              phone: newPhone,
              active: true,
            }),
          });

          if (!response.ok) throw new Error("Erro ao atualizar loja");

          showNotification("Loja atualizada com sucesso", "success");
          await loadStores();
        } catch (error) {
          
          showNotification("Erro ao atualizar loja", "error");
        }
      }

      async function deleteStore(storeId) {
    if (!confirm('Tem certeza que deseja remover esta loja? Todos os funcionários desta loja serão movidos para sem loja.')) return;

    try {
        const response = await fetch(`/api/stores/${storeId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro ao remover loja');
        }

        showNotification('Loja removida com sucesso', 'success');
        await Promise.all([
            loadStores(),
            loadEmployees()
        ]);
    } catch (error) {
        
        showNotification(error.message, 'error');
    }
}

      // Carregar funcionários
      async function loadEmployees() {
        try {
          const storeId = document.getElementById("filterStore")?.value;
          currentStoreFilter = storeId; // Armazena o filtro atual

          let url = "/api/employees";
          if (storeId) {
            url += `?store_id=${storeId}`;
          }

          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) throw new Error("Erro ao carregar funcionários");

          employees = await response.json();
          updateEmployeesList();
          updateEmployeeSelects();
        } catch (error) {
          
          showNotification("Erro ao carregar funcionários", "error");
        }
      }

      // Atualizar lista de funcionários
      function updateEmployeesList() {
    const list = document.getElementById("employeesList");
    if (!list) return;

    // Filtrar funcionários se houver um filtro de loja ativo
    const filteredEmployees = currentStoreFilter
        ? employees.filter((emp) => emp.store_id.toString() === currentStoreFilter)
        : employees;

    list.innerHTML = employees
        .map((emp) => {
            // Determinar status do funcionário
            let statusClass, statusText, statusIcon;
            if (emp.on_leave) {
                statusClass = "status-leave";
                statusText = "De Folga";
                statusIcon = "🏖️";
            } else if (!isWithinWorkHours(emp.work_start, emp.work_end)) {
                statusClass = "status-off";
                statusText = "Fora de Expediente";
                statusIcon = "🔴";
            } else {
                statusClass = "status-working";
                statusText = "Disponível";
                statusIcon = "🟢";
            }

            const store = stores.find((s) => s.id === emp.store_id);

            // Gerar HTML para horários alternativos
            let alternativeScheduleHtml = '';
            if (emp.alternative_schedule) {
                try {
                    const schedule = typeof emp.alternative_schedule === 'string' ? 
                        JSON.parse(emp.alternative_schedule) : emp.alternative_schedule;
                    
                    alternativeScheduleHtml = `
                        <div class="alternative-schedules-list">
                            <h4>Horários Alternativos:</h4>
                            <div class="schedules-grid">
                                ${Object.entries(schedule).map(([day, times]) => `
                                    <div class="schedule-item">
                                        <div class="schedule-day">${getDayName(day)}</div>
                                        <div class="schedule-time">${times.work_start} - ${times.work_end}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                } catch (e) {
                    
                }
            }

            // Retornar o HTML do card do funcionário
            return `
                <div class="employee-card">
                    <div class="employee-info">
                        <div class="employee-name">
                            ${emp.name}
                            ${store ? `<span class="store-badge">${store.name}</span>` : ""}
                        </div>
                        <div class="employee-details">
                            <div>Usuário: ${emp.username}</div>
                            <div class="work-schedule">
                                🕒 Horário Padrão: ${emp.work_start} - ${emp.work_end}
                            </div>
                            ${alternativeScheduleHtml}
                            ${store ? `
                                <div class="store-info">
                                    📍 Loja: ${store.name}
                                    ${store.address ? `<br>📮 Endereço: ${store.address}` : ""}
                                    ${store.phone ? `<br>📞 Telefone: ${store.phone}` : ""}
                                </div>
                            ` : ""}
                        </div>
                    </div>
                    <div class="employee-status ${statusClass}">
                        ${statusIcon} ${statusText}
                    </div>
                    <div class="employee-actions">
                        <button onclick="editEmployeeModal(${emp.id})" class="btn">
                            Editar
                        </button>
                        <button onclick="deleteEmployee(${emp.id})" class="btn btn-danger">
                            Remover
                        </button>
                        <button onclick="viewEmployeeTasks(${emp.id})" class="btn btn-success">
                            Tarefas
                        </button>
                    </div>
                </div>
            `;
        })
        .join("");

    // Atualizar os contadores de funcionários
    const totalEmployees = filteredEmployees.length;
    const activeEmployees = filteredEmployees.filter(
        (emp) => !emp.on_leave && isWithinWorkHours(emp.work_start, emp.work_end)
    ).length;
    const onLeaveEmployees = filteredEmployees.filter(
        (emp) => emp.on_leave
    ).length;

    // Criar e atualizar os contadores
    const counters = document.createElement("div");
    counters.className = "employee-counters";
    counters.innerHTML = `
        <div class="counter-card">
            <div class="counter-value">${totalEmployees}</div>
            <div class="counter-label">Total de Funcionários</div>
        </div>
        <div class="counter-card">
            <div class="counter-value">${activeEmployees}</div>
            <div class="counter-label">Funcionários Ativos</div>
        </div>
        <div class="counter-card">
            <div class="counter-value">${onLeaveEmployees}</div>
            <div class="counter-label">De Folga</div>
        </div>
    `;

    // Remover contadores existentes e adicionar os novos
    const existingCounters = document.querySelector(".employee-counters");
    if (existingCounters) {
        existingCounters.remove();
    }
    list.parentNode.insertBefore(counters, list);
}

// Função auxiliar para obter o nome do dia da semana
function getDayName(day) {
    const days = {
        '1': 'Segunda-feira',
        '2': 'Terça-feira',
        '3': 'Quarta-feira',
        '4': 'Quinta-feira',
        '5': 'Sexta-feira',
        '6': 'Sábado',
        '7': 'Domingo'
    };
    return days[day] || day;
}

      function updateEmployeeCounters(filteredEmployees) {
        const totalEmployees = filteredEmployees.length;
        const activeEmployees = filteredEmployees.filter(
          (emp) =>
            !emp.on_leave && isWithinWorkHours(emp.work_start, emp.work_end)
        ).length;
        const onLeaveEmployees = filteredEmployees.filter(
          (emp) => emp.on_leave
        ).length;

        const counters = document.createElement("div");
        counters.className = "employee-counters";
        counters.innerHTML = `
        <div class="counter-card">
            <div class="counter-value">${totalEmployees}</div>
            <div class="counter-label">Total de Funcionários</div>
        </div>
        <div class="counter-card">
            <div class="counter-value">${activeEmployees}</div>
            <div class="counter-label">Funcionários Ativos</div>
        </div>
        <div class="counter-card">
            <div class="counter-value">${onLeaveEmployees}</div>
            <div class="counter-label">De Folga</div>
        </div>
    `;

        const employeesList = document.getElementById("employeesList");
        const existingCounters = document.querySelector(".employee-counters");
        if (existingCounters) {
          existingCounters.remove();
        }
        employeesList.parentNode.insertBefore(counters, employeesList);
      }

      function isWithinWorkHours(workStart, workEnd) {
    if (!workStart || !workEnd) return false;

    try {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes(); // Converter para minutos

        // Converter horário de trabalho para minutos
        const [startHour, startMinute] = workStart.toString().split(":").map(Number);
        const [endHour, endMinute] = workEnd.toString().split(":").map(Number);

        const workStartMinutes = startHour * 60 + startMinute;
        const workEndMinutes = endHour * 60 + endMinute;

        return currentTime >= workStartMinutes && currentTime <= workEndMinutes;
    } catch (error) {
        
        return false;
    }
}

// Adicionar funções para manipular horários alternativos
function addScheduleRow() {
    const template = document.getElementById('scheduleRowTemplate');
    if (!template) {
        
        return;
    }

    const container = document.getElementById('alternativeSchedules');
    const clone = template.content.cloneNode(true);
    
    // Definir valores padrão para os horários
    const timeStart = clone.querySelector('.time-start');
    const timeEnd = clone.querySelector('.time-end');
    if (timeStart) timeStart.value = "08:00";
    if (timeEnd) timeEnd.value = "16:20";
    
    container.appendChild(clone);
}

function removeScheduleRow(button) {
    const row = button.closest('.schedule-row');
    if (row) {
        row.remove();
    }
}

      async function deleteTask(taskId) {
        if (!confirm("Tem certeza que deseja excluir esta tarefa?")) return;

        try {
          const response = await fetch(`/api/tasks/${taskId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Erro ao excluir tarefa");
          }

          // Se a exclusão foi bem sucedida, recarregar as listas
          await Promise.all([
            loadTasks(), // Recarrega tarefas normais
            loadFixedTasks(), // Recarrega tarefas fixas
          ]);

          showNotification("Tarefa excluída com sucesso", "success");
        } catch (error) {
          
          showNotification(error.message, "error");
        }
      }

      // Função específica para deletar tarefas fixas
      async function deleteFixedTask(taskId) {
        if (
          !confirm(
            "Tem certeza que deseja excluir esta tarefa fixa? Esta ação não pode ser desfeita."
          )
        )
          return;

        try {
          const response = await fetch(`/api/tasks/${taskId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Erro ao excluir tarefa fixa");
          }

          // Recarregar apenas a lista de tarefas fixas
          await loadFixedTasks();
          showNotification("Tarefa fixa excluída com sucesso", "success");
        } catch (error) {
          
          showNotification(error.message, "error");
        }
      }

      // Adicionar verificação periódica de status
      function checkWorkingStatus() {
        employees.forEach((emp) => {
          emp.is_working = isWithinWorkHours(emp.work_start, emp.work_end);
        });
        updateEmployeesList();
      }

      async function updateTaskStatus(taskId, status) {
        try {
          const response = await fetch(`/api/tasks/${taskId}/status`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({
              status,
              date: document.getElementById("filterDate").value,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Erro ao atualizar status");
          }

          await loadTasks();
          showNotification("Status atualizado com sucesso", "success");
        } catch (error) {
          
          showNotification(error.message, "error");
        }
      }

      // Atualizar selects de funcionários
      function updateEmployeeSelects() {
        const selects = ["taskEmployee", "leaveEmployee", "calendarEmployee"];
        selects.forEach((id) => {
          const select = document.getElementById(id);
          if (select) {
            select.innerHTML =
              id === "calendarEmployee"
                ? '<option value="">Todos</option>'
                : "";
            employees
              .filter((emp) => emp.active)
              .forEach((emp) => {
                select.innerHTML += `
                            <option value="${emp.id}">${emp.name}</option>
                        `;
              });
          }
        });
      }

      // Adicionar funcionário
      async function addEmployee(event) {
    event.preventDefault();

    const name = document.getElementById("employeeName").value;
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const workStart = document.getElementById("workStart").value;
    const workEnd = document.getElementById("workEnd").value;
    const storeId = document.getElementById("employeeStore").value;
    const alternativeSchedule = getAlternativeSchedule(); // Nova função

    if (!name || !username || !password || !storeId) {
        showNotification("Todos os campos são obrigatórios", "error");
        return;
    }

    try {
        const checkResponse = await fetch(`/api/users/check/${username}`, {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
        });

        const checkResult = await checkResponse.json();
        if (checkResult.exists) {
            showNotification("Nome de usuário já existe", "error");
            return;
        }

        const response = await fetch("/api/employees", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({
                name,
                username,
                password,
                workStart,
                workEnd,
                store_id: storeId,
                alternativeSchedule // Novo campo
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Erro ao criar funcionário");
        }

        showNotification("Funcionário adicionado com sucesso", "success");
        event.target.reset();
        await loadEmployees();
    } catch (error) {
        
        showNotification(error.message, "error");
    }
}

// Nova função para coletar horários alternativos
function getAlternativeSchedule() {
    const schedules = {};
    const rows = document.querySelectorAll('.schedule-row');
    
    rows.forEach(row => {
        const daySelect = row.querySelector('.day-select');
        const timeStart = row.querySelector('.time-start');
        const timeEnd = row.querySelector('.time-end');
        
        if (daySelect && timeStart && timeEnd && daySelect.value) {
            schedules[daySelect.value] = {
                work_start: timeStart.value,
                work_end: timeEnd.value
            };
        }
    });
    
    return Object.keys(schedules).length > 0 ? schedules : null;
}

async function editEmployeeModal(id) {
    try {
        const employee = employees.find(emp => emp.id === id);
        if (!employee) {
            showNotification('Funcionário não encontrado', 'error');
            return;
        }

        // Remover modal existente se houver
        const existingModal = document.querySelector('.edit-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Criar o modal
        const modalHtml = `
            <div class="edit-modal" role="dialog" aria-labelledby="modalTitle" aria-modal="true">
                <div class="edit-modal-content" tabindex="-1">
                    <div class="edit-modal-header">
                        <h2 class="edit-modal-title" id="modalTitle">Editar Funcionário</h2>
                        <button class="edit-modal-close" onclick="closeEditModal()" aria-label="Fechar modal">×</button>
                    </div>
                    <form id="editEmployeeForm" onsubmit="updateEmployee(event, ${id})">
                        <div class="edit-form-group">
                            <label for="editName">Nome</label>
                            <input type="text" id="editName" value="${employee.name}" required 
                                   aria-required="true">
                        </div>
                        
                        <div class="edit-form-group">
                            <label for="editWorkStart">Horário de Entrada Padrão</label>
                            <input type="time" id="editWorkStart" value="${employee.work_start || ''}" required
                                   aria-required="true">
                        </div>
                        
                        <div class="edit-form-group">
                            <label for="editWorkEnd">Horário de Saída Padrão</label>
                            <input type="time" id="editWorkEnd" value="${employee.work_end || ''}" required
                                   aria-required="true">
                        </div>
                        
                        <div class="edit-form-group">
                            <label for="editStore">Loja</label>
                            <select id="editStore" required aria-required="true">
                                <option value="">Selecione uma loja</option>
                                ${stores.map(store => `
                                    <option value="${store.id}" ${store.id === employee.store_id ? 'selected' : ''}>
                                        ${store.name}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <div class="edit-form-group">
                            <label for="editPassword">Nova Senha (deixe em branco para manter a atual)</label>
                            <input type="password" id="editPassword" 
                                   aria-required="false">
                        </div>

                        <div class="alternative-schedules-container">
                            <div class="alternative-schedules-header">
                                <h3>Horários Alternativos</h3>
                                <button type="button" class="btn" onclick="addEditScheduleRow()">
                                    + Adicionar Horário
                                </button>
                            </div>
                            <div id="editAlternativeSchedules">
                                ${generateExistingSchedules(employee.alternative_schedule)}
                            </div>
                        </div>

                        <div class="edit-modal-footer">
                            <button type="button" class="btn btn-danger" onclick="closeEditModal()">
                                Cancelar
                            </button>
                            <button type="submit" class="btn btn-success">
                                Salvar Alterações
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Adicionar modal ao DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Adicionar event listeners
        const modal = document.querySelector('.edit-modal');
        const modalContent = modal.querySelector('.edit-modal-content');
        
        // Fechar ao clicar fora
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeEditModal();
            }
        });

        // Fechar com tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeEditModal();
            }
        });

        // Focar no primeiro input
        setTimeout(() => {
            document.getElementById('editName').focus();
        }, 100);

        // Prevenir scroll do body
        document.body.style.overflow = 'hidden';
    } catch (error) {
        
        showNotification('Erro ao abrir formulário de edição', 'error');
    }
}

function generateAlternativeScheduleHTML(scheduleData) {
    if (!scheduleData) return '';
    
    let schedules;
    try {
        schedules = typeof scheduleData === 'string' ? JSON.parse(scheduleData) : scheduleData;
        
        return `
            <div class="alternative-schedules-list">
                <h4>Horários Alternativos</h4>
                <div class="schedules-grid">
                    ${Object.entries(schedules).map(([day, times]) => `
                        <div class="schedule-item">
                            <div class="schedule-day">
                                ${getDayName(day)}
                            </div>
                            <div class="schedule-time" 
                                 data-time="${times.work_start} até ${times.work_end}">
                                ${times.work_start} - ${times.work_end}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } catch (e) {
        
        return '';
    }
}

// Atualizar função de fechamento do modal
function closeEditModal() {
    const modal = document.querySelector('.edit-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = ''; // Restaurar scroll
    }
}

async function updateEmployee(event, id) {
  event.preventDefault();

  try {
      const formData = {
          name: document.getElementById('editName').value,
          workStart: document.getElementById('editWorkStart').value,
          workEnd: document.getElementById('editWorkEnd').value,
          store_id: document.getElementById('editStore').value, // Incluindo store_id
          alternativeSchedule: getAlternativeScheduleFromEdit()
      };

      const password = document.getElementById('editPassword').value;
      if (password) {
          formData.password = password;
      }

      const response = await fetch(`/api/employees/${id}`, {
          method: 'PUT',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(formData)
      });

      if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Erro ao atualizar funcionário');
      }

      showNotification('Funcionário atualizado com sucesso', 'success');
      closeEditModal();
      await loadEmployees();
  } catch (error) {
      showNotification(error.message, 'error');
  }
}


// Função para coletar horários alternativos do formulário de edição
function getAlternativeScheduleFromEdit() {
    const schedules = {};
    const rows = document.querySelectorAll('#editAlternativeSchedules .schedule-row');
    
    rows.forEach(row => {
        const daySelect = row.querySelector('.day-select');
        const timeStart = row.querySelector('.time-start');
        const timeEnd = row.querySelector('.time-end');
        
        if (daySelect && timeStart && timeEnd && daySelect.value) {
            schedules[daySelect.value] = {
                work_start: timeStart.value,
                work_end: timeEnd.value
            };
        }
    });
    
    return Object.keys(schedules).length > 0 ? schedules : null;
}

// Função para gerar HTML dos horários alternativos existentes
function generateExistingSchedules(scheduleData) {
    if (!scheduleData) return '';
    
    let schedules;
    try {
        schedules = typeof scheduleData === 'string' ? JSON.parse(scheduleData) : scheduleData;
    } catch (e) {
        
        return '';
    }

    return Object.entries(schedules).map(([day, times]) => `
        <div class="schedule-row">
            <div class="schedule-day">
                <select class="day-select" required>
                    <option value="1" ${day === '1' ? 'selected' : ''}>Segunda-feira</option>
                    <option value="2" ${day === '2' ? 'selected' : ''}>Terça-feira</option>
                    <option value="3" ${day === '3' ? 'selected' : ''}>Quarta-feira</option>
                    <option value="4" ${day === '4' ? 'selected' : ''}>Quinta-feira</option>
                    <option value="5" ${day === '5' ? 'selected' : ''}>Sexta-feira</option>
                    <option value="6" ${day === '6' ? 'selected' : ''}>Sábado</option>
                    <option value="7" ${day === '7' ? 'selected' : ''}>Domingo</option>
                </select>
            </div>
            <div class="schedule-times">
                <input type="time" class="time-start" value="${times.work_start}" required>
                <span>até</span>
                <input type="time" class="time-end" value="${times.work_end}" required>
            </div>
            <div class="schedule-actions">
                <button type="button" class="btn-remove-schedule" onclick="removeScheduleRow(this)">Remover</button>
            </div>
        </div>
    `).join('');
}

// Função para adicionar nova linha de horário no modal de edição
function addEditScheduleRow() {
    const container = document.getElementById('editAlternativeSchedules');
    const template = document.getElementById('scheduleRowTemplate');
    const clone = template.content.cloneNode(true);
    container.appendChild(clone);
}

      // Remover funcionário
      async function deleteEmployee(id) {
        if (!confirm("Tem certeza que deseja remover este funcionário?"))
          return;

        try {
          const response = await fetch(`/api/employees/${id}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) throw new Error("Erro ao remover funcionário");

          showNotification("Funcionário removido com sucesso", "success");
          await loadEmployees();
        } catch (error) {
          
          showNotification("Erro ao remover funcionário", "error");
        }
      }

      // Adicionar tarefa fixa
      async function addFixedTask(event) {
        event.preventDefault();

        const name = document.getElementById("taskName").value;
        const employeeId = document.getElementById("taskEmployee").value;

        try {
          const response = await fetch("/api/tasks/fixed", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({ name, employeeId }),
          });

          if (!response.ok) throw new Error("Erro ao criar tarefa fixa");

          showNotification("Tarefa fixa adicionada com sucesso", "success");
          event.target.reset();
          await loadFixedTasks();
        } catch (error) {
          
          showNotification("Erro ao adicionar tarefa fixa", "error");
        }
      }

      // Carregar tarefas fixas
      async function loadFixedTasks() {
        try {
          const response = await fetch("/api/tasks/fixed", {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) throw new Error("Erro ao carregar tarefas fixas");

          const tasks = await response.json();
          const list = document.getElementById("fixedTasksList");
          list.innerHTML = tasks
            .map(
              (task) => `
                    <div class="task-item">
                        <div class="task-info">
                          <span>${task.name}</span>
                            <span>Atribuído a: ${
                              employees.find((e) => e.id === task.employee_id)
                                ?.name || "N/A"
                            }</span>
                        </div>
                        <button class="btn btn-danger" onclick="deleteFixedTask(${
                          task.id
                        })">
                            Remover
                        </button>
                    </div>
                `
            )
            .join("");
        } catch (error) {
          
          showNotification("Erro ao carregar tarefas fixas", "error");
        }
      }

      // Adicionar folga
      async function addLeave(event) {
        event.preventDefault();

        const employeeId = document.getElementById("leaveEmployee").value;
        const date = document.getElementById("leaveDate").value;

        try {
          const response = await fetch("/api/leaves", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({ employeeId, date }),
          });

          if (!response.ok) throw new Error("Erro ao adicionar folga");

          showNotification("Folga adicionada com sucesso", "success");
          event.target.reset();
          await updateLeavesCalendar();
        } catch (error) {
          showNotification("Erro ao adicionar folga", "error");
        }
      }

      // Atualizar calendário de folgas
      async function updateLeavesCalendar() {
        try {
          const month = document.getElementById("calendarMonth").value;
          const employeeId = document.getElementById("calendarEmployee").value;
          const [year, monthNum] = month.split("-");

          let url = `/api/leaves?month=${monthNum}&year=${year}`;
          if (employeeId) {
            url += `&employeeId=${employeeId}`;
          }

          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) throw new Error("Erro ao carregar folgas");

          const leaves = await response.json();
          const filteredLeaves = employeeId
            ? leaves.filter(
                (leave) => leave.employee_id.toString() === employeeId
              )
            : leaves;

          const calendar = document.getElementById("leavesCalendar");
          const daysInMonth = new Date(year, monthNum, 0).getDate();
          const firstDay = new Date(year, monthNum - 1, 1).getDay();

          const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

          let calendarHTML = `
            <div class="calendar-header">
                ${weekDays.map((day) => `<div>${day}</div>`).join("")}
            </div>
            <div class="calendar">
        `;

          // Dias vazios no início do mês
          for (let i = 0; i < firstDay; i++) {
            calendarHTML += '<div class="calendar-day empty"></div>';
          }

          // Dias do mês
          for (let day = 1; day <= daysInMonth; day++) {
            const date = `${year}-${monthNum.padStart(2, "0")}-${String(
              day
            ).padStart(2, "0")}`;
            const dayLeaves = filteredLeaves.filter(
              (leave) => leave.date === date
            );
            const hasLeave = dayLeaves.length > 0;

            const employeesOnLeave = dayLeaves
              .map((leave) => ({
                name: employees.find((e) => e.id === leave.employee_id)?.name,
                leaveId: leave.id,
              }))
              .filter((e) => e.name);

            calendarHTML += `
                <div class="calendar-day ${hasLeave ? "has-leave" : ""}"
                     title="${hasLeave ? "Clique para ver detalhes" : ""}">
                    ${day}
                    ${
                      hasLeave
                        ? `
                        <div class="leave-count">${
                          employeesOnLeave.length
                        }</div>
                        <div class="leave-details">
                            ${employeesOnLeave
                              .map(
                                (emp) => `
                                <div class="leave-item">
                                    ${emp.name}
                                    <button onclick="removeLeave(${emp.leaveId})" class="btn-remove-leave">
                                        ×
                                    </button>
                                </div>
                            `
                              )
                              .join("")}
                        </div>
                    `
                        : ""
                    }
                </div>
            `;
          }

          calendar.innerHTML = calendarHTML + "</div>";
          document
            .querySelectorAll(".calendar-day.has-leave")
            .forEach((day) => {
              day.addEventListener("click", function (e) {
                if (e.target.classList.contains("btn-remove-leave")) return;
                const details = this.querySelector(".leave-details");
                if (details) {
                  details.style.display =
                    details.style.display === "block" ? "none" : "block";
                }
              });
            });
        } catch (error) {
          showNotification("Erro ao atualizar calendário", "error");
        }
      }

      function updateStoreFilters() {
        const filterStore = document.getElementById("filterStore");
        const reportStore = document.getElementById("reportStore"); // Para relatórios

        const storeOptions =
          '<option value="">Todas as Lojas</option>' +
          stores
            .map(
              (store) => `<option value="${store.id}">${store.name}</option>`
            )
            .join("");

        if (filterStore) filterStore.innerHTML = storeOptions;
        if (reportStore) reportStore.innerHTML = storeOptions;
      }

      // Modificar a função loadEmployees para incluir filtro
      async function loadEmployees() {
        try {
          const storeId = document.getElementById("filterStore")?.value;
          let url = "/api/employees";
          if (storeId) {
            url += `?store_id=${storeId}`;
          }

          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) throw new Error("Erro ao carregar funcionários");

          employees = await response.json();
          updateEmployeesList();
          updateEmployeeSelects();
        } catch (error) {
          showNotification("Erro ao carregar funcionários", "error");
        }
      }

      async function removeLeave(leaveId) {
        if (!confirm("Tem certeza que deseja remover esta folga?")) return;

        try {
          const response = await fetch(`/api/leaves/${leaveId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) throw new Error("Erro ao remover folga");

          showNotification("Folga removida com sucesso", "success");
          await updateLeavesCalendar();
        } catch (error) {
          showNotification("Erro ao remover folga", "error");
        }
      }

      // Gerar relatório
      async function generateReport(event) {
    event.preventDefault();

    const type = document.getElementById("reportType").value;
    const date = document.getElementById("reportDate").value;
    const storeId = document.getElementById("reportStore").value;

    try {
        let url = `/api/reports?type=${type}&date=${date}`;
        if (storeId) {
            url += `&store_id=${storeId}`;
        }

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
        });

        if (!response.ok) throw new Error("Erro ao gerar relatório");

        const data = await response.json();
        const content = document.getElementById("reportContent");

        content.innerHTML = `
            <div class="card">
                <div class="report-header">
                    <h2>Relatório ${
                        type === "daily" ? "Diário" : type === "weekly" ? "Semanal" : "Mensal"
                    }</h2>
                    <p>Período: ${new Date(data.period.start).toLocaleDateString()} a ${new Date(data.period.end).toLocaleDateString()}</p>
                </div>

                <div class="report-summary">
                    <div class="summary-card">
                        <div class="summary-icon">📊</div>
                        <div class="summary-value">${data.summary.totalTasks}</div>
                        <div class="summary-label">Total de Tarefas</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon">✅</div>
                        <div class="summary-value">${data.summary.totalCompleted}</div>
                        <div class="summary-label">Concluídas</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon">⏳</div>
                        <div class="summary-value">${data.summary.totalInProgress}</div>
                        <div class="summary-label">Em Andamento</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon">⏸️</div>
                        <div class="summary-value">${data.summary.totalPending}</div>
                        <div class="summary-label">Pendentes</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-icon">🏖️</div>
                        <div class="summary-value">${data.summary.totalLeaves}</div>
                        <div class="summary-label">Folgas</div>
                    </div>
                </div>

                ${data.stats.storeStats.length > 0 ? `
                    <div class="report-section">
                        <h3>Estatísticas por Loja</h3>
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Loja</th>
                                        <th>Total Tarefas</th>
                                        <th>Concluídas</th>
                                        <th>Taxa Conclusão</th>
                                        <th>Média Diária</th>
                                        <th>Funcionários</th>
                                        <th>Folgas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.stats.storeStats.map(store => `
                                        <tr>
                                            <td>${store.storeName || '-'}</td>
                                            <td>${store.tasksTotal || 0}</td>
                                            <td>${store.tasksCompleted || 0}</td>
                                            <td>
                                                <div class="completion-badge" style="background: ${getCompletionColor(store.completionRate)}">
                                                    ${store.completionRate || '0.0'}%
                                                </div>
                                            </td>
                                            <td>${store.avgTasksPerDay || '0.0'}</td>
                                            <td>${store.employeesCount || 0}</td>
                                            <td>${store.leavesCount || 0}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : ''}

                ${data.stats.employeeStats.length > 0 ? `
                    <div class="report-section">
                        <h3>Desempenho por Funcionário</h3>
                        <div class="employee-performance-grid">
                            ${data.stats.employeeStats.map(stat => `
                                <div class="performance-card">
                                    <div class="performance-header">
                                        <h4>${stat.employeeName}</h4>
                                        <div class="completion-badge" style="background: ${getCompletionColor(stat.completionRate)}">
                                            ${stat.completionRate}%
                                        </div>
                                    </div>
                                    <div class="performance-stats">
                                        <div class="stat-row">
                                            <span>Tarefas Totais:</span>
                                            <span>${stat.tasksTotal}</span>
                                        </div>
                                        <div class="stat-row">
                                            <span>Concluídas:</span>
                                            <span>${stat.tasksCompleted}</span>
                                        </div>
                                        <div class="stat-row">
                                            <span>Média Diária:</span>
                                            <span>${stat.avgTasksPerDay}</span>
                                        </div>
                                        <div class="stat-row">
                                            <span>Folgas:</span>
                                            <span>${stat.leaves}</span>
                                        </div>
                                        <div class="stat-row">
                                            <span>Tarefas Fixas:</span>
                                            <span>${stat.fixedTasks}</span>
                                        </div>
                                        <div class="stat-row">
                                            <span>Tarefas Regulares:</span>
                                            <span>${stat.regularTasks}</span>
                                        </div>
                                    </div>
                                    <div class="performance-progress">
                                        <div class="progress-bar" style="width: ${stat.completionRate}%"></div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${data.stats.taskStats.length > 0 ? `
                    <div class="report-section">
                        <h3>Análise por Tarefa</h3>
                        <div class="tasks-analysis-grid">
                            ${data.stats.taskStats.map(stat => `
                                <div class="task-analysis-card ${stat.isFixed ? 'fixed-task' : ''}">
                                    <div class="task-analysis-header">
                                        <h4>${stat.taskName}</h4>
                                        ${stat.isFixed ? '<span class="fixed-badge">Fixa</span>' : ''}
                                    </div>
                                    <div class="task-analysis-stats">
                                        <div class="stat-row">
                                            <span>Frequência:</span>
                                            <span>${stat.frequency}x</span>
                                        </div>
                                        <div class="stat-row">
                                            <span>Taxa de Conclusão:</span>
                                            <span>${stat.completionRate}%</span>
                                        </div>
                                        <div class="stat-row">
                                            <span>Funcionários:</span>
                                            <span>${stat.employees.length}</span>
                                        </div>
                                    </div>
                                    <div class="assigned-employees">
                                        ${stat.employees.map(emp => `
                                            <span class="employee-chip">${emp}</span>
                                        `).join('')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    } catch (error) {
        showNotification("Erro ao gerar relatório", "error");
    }
}

function getCompletionColor(rate) {
    rate = parseFloat(rate);
    if (rate >= 90) return '#10B981'; // Verde para ótimo desempenho
    if (rate >= 70) return '#3B82F6'; // Azul para bom desempenho
    if (rate >= 50) return '#F59E0B'; // Amarelo para desempenho médio
    return '#EF4444'; // Vermelho para baixo desempenho
}

  function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-error';
    errorDiv.textContent = message;
    
    const reportContent = document.getElementById('reportContent');
    reportContent.innerHTML = '';
    reportContent.appendChild(errorDiv);
}

  function formatReportType(type) {
    const types = {
        'daily': 'Diário',
        'weekly': 'Semanal',
        'monthly': 'Mensal'
    };
    return types[type] || type;
}

function getToken() {
    return localStorage.getItem('token');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR');
}

      // Função para visualizar tarefas do funcionário
      async function viewEmployeeTasks(employeeId) {
        try {
          const date = new Date().toISOString().split("T")[0];
          const response = await fetch(
            `/api/employees/${employeeId}/tasks?date=${date}`,
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
            }
          );

          if (!response.ok) throw new Error("Erro ao carregar tarefas");

          const tasks = await response.json();
          const employee = employees.find((emp) => emp.id === employeeId);

          // Criar modal para mostrar as tarefas
          const modalHtml = `
            <div id="taskModal" class="modal" style="display: block;">
                <div class="modal-content">
                    <h3>Tarefas de ${employee.name}</h3>
                    <div class="task-list">
                        ${
                          tasks.length > 0
                            ? tasks
                                .map(
                                  (task) => `
                            <div class="task-item">
                                <div class="task-info">
                                    <span class="task-name">${task.name}</span>
                                    <span class="task-status ${
                                      task.status
                                    }">${formatStatus(task.status)}</span>
                                </div>
                                <div class="task-type">${
                                  task.is_fixed
                                    ? "Tarefa Fixa"
                                    : "Tarefa Normal"
                                }</div>
                            </div>
                        `
                                )
                                .join("")
                            : "<p>Nenhuma tarefa encontrada para hoje.</p>"
                        }
                    </div>
                    <div class="modal-footer">
                        <button onclick="closeTaskModal()" class="btn">Fechar</button>
                    </div>
                </div>
            </div>
        `;

          // Adicionar modal ao corpo do documento
          document.body.insertAdjacentHTML("beforeend", modalHtml);

          // Adicionar evento para fechar modal clicando fora
          document
            .getElementById("taskModal")
            .addEventListener("click", function (e) {
              if (e.target === this) closeTaskModal();
            });
        } catch (error) {
          showNotification("Erro ao carregar tarefas", "error");
        }
      }

      // Função auxiliar para formatar status
      function formatStatus(status) {
        const statusMap = {
          pendente: "Pendente",
          "em-andamento": "Em Andamento",
          concluido: "Concluído",
        };
        return statusMap[status] || status;
      }

      // Função para fechar o modal
      function closeTaskModal() {
        const modal = document.getElementById("taskModal");
        if (modal) {
          modal.remove();
        }
      }

      // Função auxiliar para cor baseada na taxa de conclusão
      function getCompletionColor(rate) {
        if (rate >= 80) return "#28a745";
        if (rate >= 50) return "#ffc107";
        return "#dc3545";
      }
      // Configurar event listeners
      function setupEventListeners() {
        // Tabs
        document.querySelectorAll(".tab-button").forEach((button) => {
          button.addEventListener("click", () => {
            const tabId = button.dataset.tab;

            document
              .querySelectorAll(".tab-button")
              .forEach((b) => b.classList.remove("active"));
            document
              .querySelectorAll(".tab-content")
              .forEach((c) => c.classList.remove("active"));

            button.classList.add("active");
            document.getElementById(tabId).classList.add("active");

            // Carregar dados específicos da tab
            if (tabId === "fixed-tasks") loadFixedTasks();
            if (tabId === "leaves") updateLeavesCalendar(), loadLeaveRequests();
          });
        });

        // Forms
        document
          .getElementById("employeeForm")
          .addEventListener("submit", addEmployee);
        document
          .getElementById("fixedTaskForm")
          .addEventListener("submit", addFixedTask);
        document
          .getElementById("leaveForm")
          .addEventListener("submit", addLeave);
        document
          .getElementById("reportForm")
          .addEventListener("submit", generateReport);
        document
          .getElementById("storeForm")
          .addEventListener("submit", addStore);

        // Filtro de lojas
        document
          .getElementById("filterStore")
          ?.addEventListener("change", loadEmployees);

        // Calendário
        document
          .getElementById("calendarMonth")
          .addEventListener("change", updateLeavesCalendar);
        document
          .getElementById("calendarEmployee")
          .addEventListener("change", updateLeavesCalendar);

        const filterStore = document.getElementById("filterStore");
        if (filterStore) {
          filterStore.addEventListener("change", () => {
            loadEmployees();
          });
        }
      }

      // Sistema de notificações
      function showNotification(message, type = "info") {
        let notification = document.getElementById("notification");
        if (!notification) {
          notification = document.createElement("div");
          notification.id = "notification";
          document.body.appendChild(notification);
        }

        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.display = "block";

        setTimeout(() => {
          notification.style.display = "none";
        }, 3000);
      }

      function logout() {
        localStorage.removeItem("token");
        window.location.href = "/login.html";
      }

      // Inicializar aplicação
      init();