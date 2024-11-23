// Estado global
      let currentUser = null;
      let employees = [];
      let tasks = [];
      let stores = [];
      let currentDate = new Date();
      let selectedDate = new Date().toISOString().split("T")[0];
      let selectedDates = [];
      let existingRequests = [];

      // Funções de utilidade
      function updateDateTime() {
        const now = new Date();
        document.getElementById("date").textContent =
          now.toLocaleDateString("pt-BR");
        document.getElementById("clock").textContent =
          now.toLocaleTimeString("pt-BR");
      }

      // Configurar tabs do modal de folgas
      function setupLeavesModalTabs() {
    document.querySelectorAll('#leavesModal .tab-button').forEach(button => {
        button.addEventListener('click', async (e) => {
            // Remover classe active de todas as tabs
            document.querySelectorAll('#leavesModal .tab-button').forEach(b => 
                b.classList.remove('active'));
            document.querySelectorAll('#leavesModal .tab-content').forEach(c => 
                c.classList.remove('active'));

            // Adicionar classe active na tab clicada
            button.classList.add('active');
            
            // Mostrar conteúdo correspondente
            const tabId = button.getAttribute('data-tab');
            const content = document.getElementById(tabId);
            if (content) {
                content.classList.add('active');
            }

            // Se for a tab de solicitação, atualizar calendário
            if (tabId === 'request-leave') {
                const currentMonth = document.getElementById('requestMonth').value;
                await loadExistingRequests(currentMonth);
                updateRequestCalendar();
            }
        });
    });

        // Configurar evento de mudança de mês na solicitação

        document.getElementById('leaveMonth').addEventListener('change', updateLeavesCalendar);
    document.getElementById('requestMonth').addEventListener('change', async (e) => {
        await loadExistingRequests(e.target.value);
        updateRequestCalendar();
    });

        // Configurar botão de enviar solicitação
        document
          .getElementById("submitRequest")
          .addEventListener("click", submitLeaveRequest);
      }

      // Atualizar a função showLeavesModal para incluir a configuração das tabs
      function showLeavesModal() {
    const modal = document.getElementById('leavesModal');
    modal.style.display = 'block';
    
    // Definir mês atual
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    document.getElementById('leaveMonth').value = currentMonth;
    document.getElementById('requestMonth').value = currentMonth;
    
    // Carregar dados iniciais em sequência
    updateLeavesCalendar().then(() => {
        loadExistingRequests(currentMonth)
            .then(() => updateRequestCalendar());
    });

        // Configurar tabs se ainda não estiverem configuradas
        if (!modal.dataset.tabsConfigured) {
        setupLeavesModalTabs();
        modal.dataset.tabsConfigured = 'true';
    }
}


      function closeLeavesModal() {
        const modal = document.getElementById("leavesModal");
        modal.style.display = "none";
      }

      async function updateLeavesCalendar() {
    try {
        const month = document.getElementById('leaveMonth').value;
        const [year, monthNum] = month.split('-');
        
        // Buscar folgas do usuário
        const response = await fetch(
            `/api/employees/${currentUser.employeeId}/leaves?month=${monthNum}&year=${year}`,
            {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            }
        );

        if (!response.ok) throw new Error('Erro ao carregar folgas');
        const leaves = await response.json();

        // Montar cabeçalho do calendário
        const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const headerHtml = weekDays.map(day => `<div>${day}</div>`).join('');
        const calendarHeader = document.querySelector('#leavesCalendar .calendar-header');
        if (calendarHeader) {
            calendarHeader.innerHTML = headerHtml;
        }

        const calendar = document.querySelector('#leavesCalendar .calendar');
        if (!calendar) return;

        const daysInMonth = new Date(year, monthNum, 0).getDate();
        const firstDay = new Date(year, monthNum - 1, 1).getDay();

        let calendarHtml = '';

        // Adicionar dias vazios no início
        for (let i = 0; i < firstDay; i++) {
            calendarHtml += '<div class="calendar-day empty"></div>';
        }

        // Adicionar dias do mês
        for (let day = 1; day <= daysInMonth; day++) {
            const date = `${year}-${monthNum.padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasLeave = leaves.some(leave => leave.date === date);

            calendarHtml += `
                <div class="calendar-day ${hasLeave ? 'has-leave' : ''}">
                    ${day}
                    ${hasLeave ? '<div class="leave-count">✓</div>' : ''}
                </div>
            `;
        }

        calendar.innerHTML = calendarHtml;
    } catch (error) {
        showNotification('Erro ao atualizar calendário', 'error');
    }
}

      // Event Listeners
      document
        .getElementById("leaveMonth")
        .addEventListener("change", updateLeavesCalendar);

      // Fechar modal ao clicar fora
      window.addEventListener("click", (e) => {
        const modal = document.getElementById("leavesModal");
        if (e.target === modal) {
          closeLeavesModal();
        }
      });


      function updateRequestCalendar() {
        const month = document.getElementById("requestMonth").value;
        const [year, monthNum] = month.split("-");
        const calendar = document.querySelector("#requestCalendar .calendar");
        calendar.innerHTML = "";
    
        // Limpar seleções anteriores se não houver nenhuma seleção válida
        if (selectedDates.length !== 2) {
            selectedDates = [];
            updateSelectedDatesDisplay();
        }
    
        // Criar cabeçalho do calendário
        const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        const calendarHeader = document.querySelector("#requestCalendar .calendar-header");
        calendarHeader.innerHTML = weekDays.map((day) => `<div>${day}</div>`).join("");
    
        // Criar data do primeiro dia do mês
        const firstDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const firstDay = firstDate.getDay();
        const daysInMonth = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
    
        // Adicionar dias vazios até o primeiro dia do mês
        for (let i = 0; i < firstDay; i++) {
            const emptyDay = document.createElement("div");
            emptyDay.className = "calendar-day empty";
            calendar.appendChild(emptyDay);
        }
    
        // Buscar a loja do usuário atual
        const currentEmployee = employees.find(emp => emp.id === currentUser.employeeId);
        const userStoreId = currentEmployee?.store_id;
    
        // Adicionar todos os dias do mês
        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(parseInt(year), parseInt(monthNum) - 1, day);
            const dateString = currentDate.toISOString().split("T")[0];
            const dayOfWeek = currentDate.getDay();
    
            const isSaturday = dayOfWeek === 6;
            const isSunday = dayOfWeek === 0;
            const isWeekend = isSaturday || isSunday;
            
            // Verificar se existe solicitação pendente para a mesma loja
            const isUnavailable = existingRequests.some(req => 
                req.date === dateString && 
                req.storeId === userStoreId &&
                req.status === 'pending'
            );
            
            const isSelected = selectedDates.includes(dateString);
    
            const dayElement = document.createElement("div");
            dayElement.className = "calendar-day";
    
            if (isWeekend) dayElement.classList.add("weekend");
            if (isUnavailable) dayElement.classList.add("unavailable");
            if (isSelected) dayElement.classList.add("selected");
    
            // Adicionar indicador de Sáb/Dom
            dayElement.textContent = `${day}${isSaturday ? " (Sáb)" : isSunday ? " (Dom)" : ""}`;
            dayElement.dataset.date = dateString;
            dayElement.dataset.dayOfWeek = dayOfWeek;
    
            // Adicionar evento de clique apenas para fins de semana não indisponíveis
            if (isWeekend && !isUnavailable) {
                dayElement.addEventListener("click", () => selectDate(dayElement));
                dayElement.style.cursor = "pointer";
            }
    
            // Adicionar tooltip se estiver indisponível
            if (isUnavailable) {
                const request = existingRequests.find(req => 
                    req.date === dateString && 
                    req.storeId === userStoreId
                );
                if (request) {
                    dayElement.title = "Data já solicitada por outro funcionário da loja";
                }
            }
    
            calendar.appendChild(dayElement);
        }
    }

      function selectDate(element) {
        const date = element.dataset.date;
        const dayOfWeek = parseInt(element.dataset.dayOfWeek);

        // Se já está selecionado, remove a seleção
        if (selectedDates.includes(date)) {
          selectedDates = selectedDates.filter((d) => d !== date);
          element.classList.remove("selected");
          updateSelectedDatesDisplay();
          return;
        }

        // Se nenhuma data selecionada ainda, deve ser um sábado
        if (selectedDates.length === 0) {
          if (dayOfWeek !== 6) {
            showNotification("Selecione primeiro um sábado", "warning");
            return;
          }
          selectedDates.push(date);
          element.classList.add("selected");
        }
        // Se já tem uma data selecionada, deve ser um domingo consecutivo
        else if (selectedDates.length === 1) {
          if (dayOfWeek !== 0) {
            showNotification("Selecione um domingo", "warning");
            return;
          }

          const saturdayDate = new Date(selectedDates[0]);
          const sundayDate = new Date(date);
          const diffTime = Math.abs(sundayDate - saturdayDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays !== 1) {
            showNotification(
              "Selecione o domingo consecutivo ao sábado",
              "warning"
            );
            return;
          }

          selectedDates.push(date);
          element.classList.add("selected");
        }

        updateSelectedDatesDisplay();
      }

      function updateSelectedDatesDisplay() {
        const display = document.getElementById("selectedDates");
        const submitButton = document.getElementById("submitRequest");

        if (selectedDates.length === 0) {
          display.innerHTML = "Nenhuma data selecionada";
          submitButton.disabled = true;
        } else {
          const dates = selectedDates.map((date) => {
            const [year, month, day] = date.split("-");
            const d = new Date(year, month - 1, day); // Sem ajuste UTC
            return d.toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            });
          });

          display.innerHTML = dates.join("<br>");
          submitButton.disabled = selectedDates.length !== 2;
        }
      }

      async function submitLeaveRequest() {
    try {
        const response = await fetch('/api/leave-requests', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ 
                dates: selectedDates,
                status: 'pending'  // Adicionando status explicitamente
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message);
        }
        
        showNotification('Solicitação enviada com sucesso', 'success');
        selectedDates = [];
        updateRequestCalendar();
        await loadExistingRequests(); // Recarregar solicitações após enviar
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function loadExistingRequests(month) {
  try {
      if (!month) {
          month = new Date().toISOString().slice(0, 7);
      }

      const response = await fetch(`/api/leave-requests?month=${month}`, {
          headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
      });
      
      if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Erro ao carregar solicitações');
      }
      
      const requests = await response.json();
      
      // Mapear as datas das solicitações para verificar disponibilidade
      existingRequests = [];
      requests.forEach(request => {
          request.dates.forEach(date => {
              existingRequests.push({
                  date: date,
                  employeeId: request.employeeId,
                  storeId: request.storeId,
                  status: request.status
              });
          });
      });

      return existingRequests;
  } catch (error) {
      showNotification('Erro ao carregar solicitações existentes', 'error');
      return [];
  }
}

      // Atualizar relógio a cada segundo
      setInterval(updateDateTime, 1000);
      updateDateTime();

      // Funções de autenticação
      function logout() {
        localStorage.removeItem("token");
        window.location.href = "/login.html";
      }

      // Função para carregar lojas
      async function loadStores() {
        try {
          const response = await fetch("/api/stores", {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) throw new Error("Erro ao carregar lojas");

          stores = await response.json();
          updateStoreSelects();
        } catch (error) {
          showNotification("Erro ao carregar lojas", "error");
        }
      }

      // Função para atualizar selects de loja
      function updateStoreSelects() {
        const filterStore = document.getElementById("filterStore");
        const taskStore = document.getElementById("taskStore");

        const storeOptions = stores
          .filter((store) => store.active)
          .map((store) => `<option value="${store.id}">${store.name}</option>`)
          .join("");

        if (filterStore) {
          filterStore.innerHTML =
            '<option value="">Todas as Lojas</option>' + storeOptions;
        }
        if (taskStore) {
          taskStore.innerHTML =
            '<option value="">Selecione uma Loja</option>' + storeOptions;
        }
      }

      // Funções do modal
      function showAddTaskModal() {
        const modal = document.getElementById("taskModal");
        const modalContent = modal.querySelector(".modal-content");

        // Atualizar o HTML do modal para incluir seleção de loja para admin
        if (currentUser.isAdmin) {
          // Verificar se o elemento de loja já existe para evitar duplicação
          if (!modalContent.querySelector("#taskStore")) {
            const storeSelect = document.createElement("div");
            storeSelect.className = "form-group";
            storeSelect.innerHTML = `
                <label for="taskStore">Loja *</label>
                <select id="taskStore" required>
                    <option value="">Selecione uma loja</option>
                    ${stores
                      .filter((store) => store.active)
                      .map(
                        (store) => `
                            <option value="${store.id}">${store.name}</option>
                        `
                      )
                      .join("")}
                </select>
            `;

            // Inserir o select de loja após o título do modal
            const modalHeader = modalContent.querySelector(".modal-header");
            modalHeader.insertAdjacentElement("afterend", storeSelect);

            // Adicionar evento para atualizar funcionários quando a loja for selecionada
            document
              .getElementById("taskStore")
              .addEventListener("change", updateEmployeeSelect);
          }
        }

        modal.style.display = "block";

        // Limpar campos
        document.getElementById("taskName").value = "";
        document.getElementById("taskDescription").value = "";
        document.getElementById("taskPriority").value = "1";
        if (currentUser.isAdmin) {
          document.getElementById("taskStore").value = "";
        }
        document.getElementById("assignedTo").innerHTML =
          '<option value="">Distribuição Automática</option>';
        document.getElementById("isFixed").checked = false;

        document.getElementById("taskName").focus();
      }

      function updateGreeting() {
        const hour = new Date().getHours();
        let greeting = "";
        let icon = "";

        if (hour >= 5 && hour < 12) {
          greeting = "Bom dia";
          icon = "🌅";
        } else if (hour >= 12 && hour < 18) {
          greeting = "Boa tarde";
          icon = "☀️";
        } else {
          greeting = "Boa noite";
          icon = "🌙";
        }

        const greetingElement = document.getElementById("userGreeting");
        const token = localStorage.getItem("token");

        if (greetingElement && token) {
          try {
            const userData = JSON.parse(atob(token.split(".")[1]));
            const userName = userData.employeeName || userData.username;
            greetingElement.innerHTML = `${icon} Olá, ${userName}! ${greeting}!`;
          } catch (error) {
            greetingElement.innerHTML = `${icon} ${greeting}!`;
          }
        }
      }

      function configureInitialInterface() {
        const currentEmployee = employees.find(
          (emp) => emp.id === currentUser.employeeId
        );

        if (currentEmployee?.store_id) {
          const filterStore = document.getElementById("filterStore");
          if (filterStore) {
            filterStore.value = currentEmployee.store_id;

            // Se não for admin, desabilitar a troca de loja
            if (!currentUser.isAdmin) {
              filterStore.disabled = true;
            }

            // Disparar evento de change para atualizar a visualização
            filterStore.dispatchEvent(new Event("change"));
          }
        }
      }

      // Inicialização
      async function init() {
        const token = localStorage.getItem("token");
        if (!token) {
          window.location.href = "/login.html";
          return;
        }

        try {
          currentUser = JSON.parse(atob(token.split(".")[1]));

          updateGreeting();
          updateDateTime();

          selectedDate = new Date().toISOString().split("T")[0];
          document.getElementById("filterDate").value = selectedDate;

          await loadStores();
          await loadEmployees();

          // Configurar interface inicial após carregar funcionários
          configureInitialInterface();

          await loadTasks();
          updateStatistics();

          // Configurar atualizações periódicas
          setInterval(async () => {
            await loadTasks();
            updateStatistics();
          }, 60000);

          setupFilterEvents();
        } catch (error) {
          logout();
        }
      }

      function setupFilterEvents() {
        // Filtro de data
        document
          .getElementById("filterDate")
          .addEventListener("change", async (e) => {
            selectedDate = e.target.value;
            await loadTasks();
            await loadEmployees();
            updateStatistics();
          });

        // Filtro de status
        document
          .getElementById("filterStatus")
          .addEventListener("change", async () => {
            await loadTasks();
            updateStatistics();
          });

        // Filtro de loja
        document
          .getElementById("filterStore")
          .addEventListener("change", async () => {
            await loadEmployees();
            await loadTasks();
            updateStatistics();
          });
      }

      async function loadEmployees() {
        try {
          const storeId = document.getElementById("filterStore")?.value;
          let url = `/api/employees/available?date=${selectedDate}`;

          // Se não for admin, usar a loja do usuário atual
          if (!currentUser.isAdmin) {
            // Buscar todos os funcionários para encontrar o usuário atual
            const empResponse = await fetch("/api/employees", {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
            });

            if (!empResponse.ok)
              throw new Error("Erro ao carregar funcionários");
            const allEmployees = await empResponse.json();

            // Encontrar o funcionário atual e sua loja
            const currentEmployee = allEmployees.find(
              (emp) => emp.id === currentUser.employeeId
            );
            if (currentEmployee && currentEmployee.store_id) {
              // Atualizar o select de loja
              const filterStore = document.getElementById("filterStore");
              if (filterStore) {
                filterStore.value = currentEmployee.store_id;
                filterStore.disabled = true;
              }

              url += `&store_id=${currentEmployee.store_id}`;
            }
          } else if (storeId) {
            url += `&store_id=${storeId}`;
          }

          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) throw new Error("Erro ao carregar funcionários");

          employees = await response.json();
          updateEmployeeSelect();
          renderTaskGrid();
        } catch (error) {
          showNotification("Erro ao carregar funcionários", "error");
        }
      }

      // Adicionar função para atualizar a saudação
      function getCurrentUser() {
        try {
          const token = localStorage.getItem("token");
          if (!token) return null;

          const base64Url = token.split(".")[1];
          const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
          const jsonPayload = decodeURIComponent(
            atob(base64)
              .split("")
              .map(function (c) {
                return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
              })
              .join("")
          );

          return JSON.parse(jsonPayload);
        } catch (error) {
          return null;
        }
      }

      // Adicionar função para configurar interface baseada no usuário
      function configureUserInterface() {
        const adminElements = document.querySelectorAll(".admin-only");
        adminElements.forEach((el) => {
          el.style.display = currentUser.isAdmin ? "block" : "none";
        });
      }
      function updateEmployeesByStore() {
        const storeId = document.getElementById("taskStore").value;
        const assignedTo = document.getElementById("assignedTo");

        assignedTo.innerHTML =
          '<option value="">Distribuição Automática</option>';

        const filteredEmployees = employees.filter(
          (emp) =>
            !emp.on_leave && (!storeId || emp.store_id.toString() === storeId)
        );

        filteredEmployees.forEach((emp) => {
          assignedTo.innerHTML += `
            <option value="${emp.id}">
                ${emp.name} (${emp.task_count || 0} tarefas)
            </option>
        `;
        });
      }
      function checkWorkingStatus() {
        const now = new Date();
        const currentTime =
          now.getHours().toString().padStart(2, "0") +
          ":" +
          now.getMinutes().toString().padStart(2, "0");

        employees.forEach((emp) => {
          emp.is_working =
            currentTime >= emp.work_start &&
            currentTime <= emp.work_end &&
            !emp.on_leave;
        });

        renderTaskGrid();
      }

      // Função principal para atualizar estatísticas
      function updateStatistics() {
        const filteredTasks = tasks;
        const totalTasks = filteredTasks.length;
        const completedTasks = filteredTasks.filter(
          (t) => t.status === "concluido"
        ).length;
        const activeEmployees = employees.filter((e) => !e.on_leave).length;

        document.getElementById("totalTasks").textContent = totalTasks;
        document.getElementById("completedTasks").textContent = completedTasks;
        document.getElementById("activeEmployees").textContent =
          activeEmployees;
      }

      // Modificar a função loadTasks para garantir que as estatísticas sejam atualizadas
      async function loadTasks() {
        try {
          const statusFilter = document.getElementById("filterStatus").value;
          const dateFilter = document.getElementById("filterDate").value;

          // Obter store_id do filtro ou do usuário atual
          let storeId;
          if (!currentUser.isAdmin) {
            // Para não-admin, sempre usar a loja do usuário
            const currentEmployee = employees.find(
              (emp) => emp.id === currentUser.employeeId
            );
            storeId = currentEmployee?.store_id;
          } else {
            // Para admin, usar o filtro de loja selecionado
            storeId = document.getElementById("filterStore")?.value;
          }

          // Construir URL com os filtros
          let url = `/api/tasks?date=${dateFilter}`;

          // Sempre incluir store_id se estiver definido
          if (storeId) {
            url += `&store_id=${storeId}`;
          }

          // Adicionar filtro de status se houver
          if (statusFilter && statusFilter !== "all") {
            url += `&status=${statusFilter}`;
          }

          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) {
            throw new Error("Erro ao carregar tarefas");
          }

          tasks = await response.json();

          renderTaskGrid();
          updateStatistics();
        } catch (error) {
          showNotification("Erro ao carregar tarefas", "error");
        }
      }

      // Atualizar select de funcionários
      async function updateEmployeeSelect() {
        try {
            const select = document.getElementById("assignedTo");
            select.innerHTML = '<option value="">Distribuição Automática</option>';
    
            // Determinar a loja correta
            let storeId;
            if (currentUser.isAdmin) {
                storeId = document.getElementById("taskStore")?.value;
                if (!storeId) {
                    return; // Se admin não selecionou loja, não carregar funcionários
                }
            } else {
                const currentEmployee = employees.find(emp => emp.id === currentUser.employeeId);
                storeId = currentEmployee?.store_id;
            }
    
            if (!storeId) {
                showNotification("Selecione uma loja primeiro", "warning");
                return;
            }
    
            // Filtrar funcionários da loja selecionada sem verificar horário
            const storeEmployees = employees.filter(emp => 
                emp.store_id === parseInt(storeId) && 
                !emp.on_leave
            );
    
            storeEmployees.forEach(emp => {
                select.innerHTML += `
                    <option value="${emp.id}">
                        ${emp.name} (${emp.task_count || 0} tarefas)
                    </option>
                `;
            });
    
            if (storeEmployees.length === 0) {
                showNotification("Nenhum funcionário disponível na loja selecionada", "warning");
            }
    
        } catch (error) {
            showNotification("Erro ao carregar funcionários disponíveis", "error");
        }
    }
      // Renderizar grid de tarefas
      function renderTaskGrid() {
        const grid = document.getElementById("taskGrid");
        grid.innerHTML = "";

        // Obter o filtro de loja atual
        const storeFilter = document.getElementById("filterStore")?.value;

        // Filtrar funcionários pela loja selecionada
        const filteredEmployees = storeFilter
          ? employees.filter((emp) => emp.store_id === parseInt(storeFilter))
          : employees;

        const tasksByEmployee = new Map();
        filteredEmployees.forEach((emp) => {
          tasksByEmployee.set(emp.id, []);
        });

        tasks.forEach((task) => {
          if (task.employee_id && tasksByEmployee.has(task.employee_id)) {
            tasksByEmployee.get(task.employee_id).push(task);
          }
        });

        // Primeiro, renderizar o card do usuário atual se estiver na loja filtrada
        const currentEmployee = filteredEmployees.find(
          (emp) => emp.id === currentUser.employeeId
        );
        if (currentEmployee) {
          const currentUserTasks =
            tasksByEmployee.get(currentUser.employeeId) || [];
          const currentUserCard = createEmployeeCard(
            currentEmployee,
            currentUserTasks,
            true
          );
          grid.appendChild(currentUserCard);
        }

        // Depois, renderizar os cards dos outros funcionários da loja filtrada
        filteredEmployees.forEach((emp) => {
          if (emp.id !== currentUser.employeeId) {
            const employeeTasks = tasksByEmployee.get(emp.id) || [];
            const card = createEmployeeCard(emp, employeeTasks, false);
            grid.appendChild(card);
          }
        });
      }

      function createEmployeeCard(emp, employeeTasks, isCurrentUser) {
    const selectedDate = document.getElementById('filterDate')?.value || new Date().toISOString().split('T')[0];
    
    const card = document.createElement("div");
    card.className = `employee-card ${isCurrentUser ? "current-user" : ""}`;

    if (isCurrentUser) {
        card.style.border = "2px solid var(--accent)";
    }

    const workHours = getEmployeeWorkHours(emp, selectedDate);
    const isWorking = isWithinWorkHours(emp, selectedDate);
    const storeName = stores.find((s) => s.id === emp.store_id)?.name || "Sem loja";

    const weekDays = {
        1: 'Segunda',
        2: 'Terça',
        3: 'Quarta',
        4: 'Quinta',
        5: 'Sexta',
        6: 'Sábado',
        7: 'Domingo'
    };

    const completedTasks = employeeTasks.filter((t) => t.status === "concluido").length;
    const totalTasks = employeeTasks.length;
    const completionRate = totalTasks ? ((completedTasks / totalTasks) * 100).toFixed(0) : 0;

    let statusClass, statusText;
    if (emp.on_leave) {
        statusClass = "status-leave";
        statusText = "De Folga";
    } else if (!isWorking) {
        statusClass = "status-off";
        statusText = "Fora de Expediente";
    } else {
        statusClass = "status-working";
        statusText = "Disponível";
    }

    card.innerHTML = `
        <div class="employee-header">
            <div class="employee-info">
                <div class="employee-name">
                    ${emp.name}
                    ${isCurrentUser ? '<span class="current-user-badge">Você</span>' : ""}
                    <span class="store-badge">${storeName}</span>
                </div>
                <div class="work-schedule">
                    🕒 Horário: ${workHours.start} - ${workHours.end}
                    ${workHours.isAlternative ? 
                        `<span class="alternative-badge">
                            Horário Alternativo (${weekDays[workHours.dayOfWeek]})
                        </span>` 
                        : ''}
                </div>
                <div class="employee-task-count">
                    ${totalTasks} tarefas • ${completionRate}% concluído
                </div>
            </div>
            <span class="employee-status ${statusClass}">
                ${statusText}
            </span>
        </div>
        <div class="tasks-container">
            ${employeeTasks.length === 0 
                ? '<div class="no-tasks">Sem tarefas atribuídas</div>' 
                : employeeTasks.map((task) => {
                    const canEdit = (currentUser.isAdmin || isCurrentUser) && 
                                  isWorking && !emp.on_leave;

                    return `
                        <div class="task-item ${task.is_fixed ? "fixed" : ""} 
                                    ${task.status === "concluido" ? "completed" : ""}">
                            <div class="task-info">
                                <span class="task-priority priority-${task.priority}"></span>
                                <div class="task-name">${task.name}</div>
                            </div>
                            <div class="task-controls">
                                <select class="task-status status-${task.status}"
                                        onchange="updateTaskStatus(${task.id}, this.value)"
                                        ${!canEdit ? "disabled" : ""}>
                                    <option value="pendente" 
                                        ${task.status === "pendente" ? "selected" : ""}>
                                        Pendente
                                    </option>
                                    <option value="em-andamento" 
                                        ${task.status === "em-andamento" ? "selected" : ""}>
                                        Em Andamento
                                    </option>
                                    <option value="concluido" 
                                        ${task.status === "concluido" ? "selected" : ""}>
                                        Concluído
                                    </option>
                                </select>
                                ${
                                    currentUser.isAdmin && !task.is_fixed
                                        ? `<button 
                                            class="btn btn-danger btn-small" 
                                            onclick="deleteTask(${task.id})"
                                            title="Remover Tarefa">×</button>`
                                        : ""
                                }
                            </div>
                        </div>
                    `;
                }).join("")}
        </div>
    `;

    return card;
}

function isValidAlternativeSchedule(schedule) {
    if (!schedule) return false;
    try {
        const parsed = typeof schedule === 'string' ? JSON.parse(schedule) : schedule;
        return Object.entries(parsed).every(([day, times]) => {
            return (
                day >= 1 && day <= 7 &&
                times.work_start &&
                times.work_end &&
                typeof times.work_start === 'string' &&
                typeof times.work_end === 'string' &&
                /^\d{2}:\d{2}$/.test(times.work_start) &&
                /^\d{2}:\d{2}$/.test(times.work_end)
            );
        });
    } catch (error) {
        return false;
    }
}

function getEmployeeWorkHours(emp, selectedDate = null) {
    try {
        // Criar a data mantendo o timezone local
        let date;
        if (selectedDate) {
            // Dividir a data em componentes
            const [year, month, day] = selectedDate.split('-').map(Number);
            // Criar data local (mês é 0-based no JavaScript)
            date = new Date(year, month - 1, day, 12, 0, 0);
        } else {
            date = new Date(); // Data atual
        }


        // Obter o dia da semana (0-6) e converter para 1-7
        let currentDay = date.getDay();
        currentDay = currentDay === 0 ? 7 : currentDay;

        if (emp.alternative_schedule) {
            const altSchedule = typeof emp.alternative_schedule === 'string' 
                ? JSON.parse(emp.alternative_schedule) 
                : emp.alternative_schedule;

            if (altSchedule[currentDay]) {
                return {
                    start: altSchedule[currentDay].work_start,
                    end: altSchedule[currentDay].work_end,
                    isAlternative: true,
                    dayOfWeek: currentDay
                };
            }
        }

        return {
            start: emp.work_start,
            end: emp.work_end,
            isAlternative: false,
            dayOfWeek: currentDay
        };
    } catch (error) {
        return {
            start: emp.work_start,
            end: emp.work_end,
            isAlternative: false,
            dayOfWeek: currentDay
        };
    }
}

// Modifique a função isWithinWorkHours existente para usar getEmployeeWorkHours
// Função auxiliar para verificar o dia da semana de uma data
function getDayOfWeek(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return {
        dayNumber: date.getDay(),
        dayName: weekdays[date.getDay()],
        convertedDay: date.getDay() === 0 ? 7 : date.getDay()
    };
}

// Função atualizada para verificar horário de trabalho
function isWithinWorkHours(emp, selectedDate = null) {
    try {
        const workHours = getEmployeeWorkHours(emp, selectedDate);
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

        // Para datas diferentes da atual
        if (selectedDate) {
            const [selectedYear, selectedMonth, selectedDay] = selectedDate.split('-').map(Number);
            const selectedDateObj = new Date(selectedYear, selectedMonth - 1, selectedDay);
            const today = new Date();
            
            if (selectedDateObj.toLocaleDateString() !== today.toLocaleDateString()) {
                // Para datas futuras ou passadas, verificar apenas se tem horário definido
                return Boolean(workHours.start && workHours.end);
            }
        }


        return currentTime >= workHours.start && currentTime <= workHours.end;
    } catch (error) {
        return false;
    }
}
      // Atualizar status da tarefa
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

          // Atualizar a tarefa localmente
          const taskIndex = tasks.findIndex((t) => t.id === taskId);
          if (taskIndex !== -1) {
            tasks[taskIndex].status = status;
            updateStatistics(); // Atualizar estatísticas imediatamente
          }

          await loadTasks(); // Recarregar todas as tarefas
          showNotification("Status atualizado com sucesso", "success");
        } catch (error) {
          showNotification(error.message, "error");
        }
      }

      async function getFixedTasksHistory(startDate, endDate) {
        try {
          const response = await fetch(
            `/api/tasks/fixed/history?start=${startDate}&end=${endDate}`,
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
            }
          );

          if (!response.ok) throw new Error("Erro ao buscar histórico");
          return await response.json();
        } catch (error) {
          return [];
        }
      }

      // Distribuir tarefas automaticamente
      async function distributeTasksAutomatically() {
        try {
            let storeId;
    
            if (currentUser.isAdmin) {
                const selectedStore = await showStoreSelectionModal();
                if (!selectedStore) return;
                storeId = selectedStore;
            } else {
                const currentEmployee = employees.find(emp => emp.id === currentUser.employeeId);
                storeId = currentEmployee?.store_id;
            }
    
            if (!storeId) {
                showNotification("Erro: Loja não definida", "error");
                return;
            }
    
            // Verificar funcionários disponíveis com mais detalhes
            const now = new Date();
            const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            const selectedDateObj = new Date(selectedDate);
            const isToday = selectedDateObj.toDateString() === now.toDateString();
            
            // Array para guardar informações detalhadas de disponibilidade
            const employeeAvailability = employees
                .filter(emp => emp.store_id === parseInt(storeId))
                .map(emp => {
                    const workHours = getEmployeeWorkHours(emp, selectedDate);
                    const isAvailable = !emp.on_leave && 
                                      (isToday ? 
                                        (currentTime >= workHours.start && currentTime <= workHours.end) : 
                                        true);
    
                    return {
                        employee: emp,
                        workHours,
                        isAvailable,
                        currentTaskCount: tasks.filter(t => 
                            t.employee_id === emp.id && 
                            t.date === selectedDate
                        ).length
                    };
                });
    
    
            // Filtrar funcionários realmente disponíveis
            const availableEmployees = employeeAvailability
                .filter(ea => ea.isAvailable)
                .sort((a, b) => a.currentTaskCount - b.currentTaskCount); // Ordenar por menor número de tarefas
    
    
            // Verificar tarefas não atribuídas
            const unassignedTasks = tasks.filter(task => 
                task.store_id === parseInt(storeId) && 
                (!task.employee_id || task.employee_id === 0) &&
                task.date === selectedDate
            );
    
            if (unassignedTasks.length === 0) {
                showNotification("Não há tarefas para distribuir", "warning");
                return;
            }
    
            if (availableEmployees.length === 0) {
                const workHoursInfo = employeeAvailability
                    .map(ea => `${ea.employee.name}: ${ea.workHours.start} - ${ea.workHours.end}${ea.isAvailable ? ' (Disponível)' : ' (Indisponível)'}`)
                    .join('\n');
    
                showNotification(
                    `Não há funcionários disponíveis no momento.\n\nHorários de trabalho:\n${workHoursInfo}`, 
                    "error"
                );
                return;
            }
    
            // Preparar dados para a distribuição
            const distributionData = {
                store_id: storeId,
                date: selectedDate,
                debug: {
                    unassignedTaskCount: unassignedTasks.length,
                    availableEmployeesCount: availableEmployees.length,
                    currentTime,
                    clientTime: new Date().toISOString(),
                    employeeDetails: availableEmployees.map(ea => ({
                        id: ea.employee.id,
                        name: ea.employee.name,
                        workHours: ea.workHours,
                        currentTaskCount: ea.currentTaskCount
                    }))
                }
            };
    
            const response = await fetch("/api/tasks/distribute", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify(distributionData)
            });
    
            const result = await response.json();
    
            if (!response.ok) {
                throw new Error(result.message || 'Erro ao distribuir tarefas');
            }
    
            // Atualizar interface após distribuição bem-sucedida
            await Promise.all([
                loadTasks(),
                loadEmployees()
            ]);
            
            updateStatistics();
    
            // Criar resumo detalhado da distribuição
            const distributionSummary = result.distributions?.reduce((summary, d) => {
                const emp = availableEmployees.find(ae => ae.employee.id === d.employeeId);
                const taskCount = emp ? emp.currentTaskCount + 1 : '?';
                return summary + `\n${d.taskName || 'Tarefa'} → ${d.employeeName} (Total: ${taskCount})`;
            }, 'Resumo da distribuição:');
    
            showNotification(
                `${result.message}\n${distributionSummary}`, 
                "success"
            );
    
        } catch (error) {
            
            showNotification(
                `Erro ao distribuir tarefas: ${error.message}`, 
                "error"
            );
        }
    }

      function showStoreSelectionModal() {
        return new Promise((resolve) => {
          // Criar modal dinamicamente
          const modalHtml = `
            <div id="storeSelectionModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Selecionar Loja</h2>
                    </div>
                    <div class="form-group">
                        <label for="distributeStore">Selecione a loja para distribuir as tarefas:</label>
                        <select id="distributeStore" class="form-control">
                            <option value="">Selecione uma loja</option>
                            ${stores
                              .filter((store) => store.active)
                              .map(
                                (store) => `
                                    <option value="${store.id}">${store.name}</option>
                                `
                              )
                              .join("")}
                        </select>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-danger" onclick="closeStoreSelectionModal(null)">Cancelar</button>
                        <button class="btn btn-success" onclick="confirmStoreSelection()">Confirmar</button>
                    </div>
                </div>
            </div>
        `;

          // Adicionar modal ao body
          const modalContainer = document.createElement("div");
          modalContainer.innerHTML = modalHtml;
          document.body.appendChild(modalContainer);

          const modal = document.getElementById("storeSelectionModal");
          modal.style.display = "block";

          // Adicionar funções de fechamento do modal ao escopo global
          window.closeStoreSelectionModal = (storeId) => {
            modal.remove();
            resolve(storeId);
          };

          window.confirmStoreSelection = () => {
            const selectedStore =
              document.getElementById("distributeStore").value;
            if (!selectedStore) {
              showNotification("Selecione uma loja", "warning");
              return;
            }
            closeStoreSelectionModal(selectedStore);
          };

          // Fechar modal ao clicar fora
          modal.onclick = (e) => {
            if (e.target === modal) {
              closeStoreSelectionModal(null);
            }
          };
        });
      }

      // Salvar nova tarefa
      async function saveTask() {
        const name = document.getElementById("taskName").value;
        const description = document.getElementById("taskDescription").value;
        const employeeId = document.getElementById("assignedTo").value;
        const priority = document.getElementById("taskPriority").value;
        const isFixed = document.getElementById("isFixed").checked;

        if (!name) {
          showNotification("Digite o nome da tarefa", "warning");
          return;
        }

        // Determinar a loja correta
        let storeId;
        if (currentUser.isAdmin) {
          storeId = document.getElementById("taskStore")?.value;
          if (!storeId) {
            showNotification("Selecione uma loja", "warning");
            return;
          }
        } else {
          const currentEmployee = employees.find(
            (emp) => emp.id === currentUser.employeeId
          );
          storeId = currentEmployee?.store_id;
        }

        if (!storeId) {
          showNotification("Erro: Loja não definida", "error");
          return;
        }

        try {
          const taskData = {
            name,
            description,
            employeeId: employeeId || null,
            priority: parseInt(priority),
            isFixed,
            date: selectedDate,
            store_id: parseInt(storeId),
          };

          const response = await fetch("/api/tasks", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify(taskData),
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.message || "Erro ao criar tarefa");
          }

          // Adicionar a nova tarefa ao array local
          const newTask = {
            ...result,
            store_id: parseInt(storeId),
          };
          tasks.push(newTask);

          // Atualizar estatísticas e interface
          updateStatistics();
          renderTaskGrid();

          closeTaskModal();

          // Recarregar dados
          await Promise.all([loadTasks(), loadEmployees()]);

          showNotification("Tarefa criada com sucesso", "success");
        } catch (error) {
          showNotification(error.message, "error");
        }
      }

      // Excluir tarefa
      async function deleteTask(taskId) {
        try {
          const task = tasks.find((t) => t.id === taskId);
          if (!task) throw new Error("Tarefa não encontrada");

          const canDelete =
            currentUser.isAdmin || task.employee_id === currentUser.employeeId;

          if (!canDelete) {
            throw new Error("Você não tem permissão para excluir esta tarefa");
          }

          if (!confirm("Tem certeza que deseja excluir esta tarefa?")) return;

          const response = await fetch(`/api/tasks/${taskId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) throw new Error("Erro ao excluir tarefa");

          // Remover a tarefa localmente
          tasks = tasks.filter((t) => t.id !== taskId);
          updateStatistics(); // Atualizar estatísticas imediatamente

          await loadTasks(); // Recarregar todas as tarefas
          showNotification("Tarefa excluída com sucesso", "success");
        } catch (error) {
          showNotification(error.message, "error");
        }
      }

      // Atualizar estatísticas
      // Função atualizada para carregar tarefas
      async function loadTasks() {
        try {
          const statusFilter = document.getElementById("filterStatus").value;
          const dateFilter = document.getElementById("filterDate").value;

          // Obter store_id do filtro ou do usuário atual
          let storeId;
          if (!currentUser.isAdmin) {
            // Para não-admin, sempre usar a loja do usuário
            const currentEmployee = employees.find(
              (emp) => emp.id === currentUser.employeeId
            );
            storeId = currentEmployee?.store_id;
          } else {
            // Para admin, usar o filtro de loja selecionado
            storeId = document.getElementById("filterStore")?.value;
          }

          // Construir URL com os filtros
          let url = `/api/tasks?date=${dateFilter}`;

          // Sempre incluir store_id se estiver definido
          if (storeId) {
            url += `&store_id=${storeId}`;
          }

          // Adicionar filtro de status se houver
          if (statusFilter && statusFilter !== "all") {
            url += `&status=${statusFilter}`;
          }

          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          });

          if (!response.ok) {
            throw new Error("Erro ao carregar tarefas");
          }

          tasks = await response.json();

          renderTaskGrid();
          updateStatistics();
        } catch (error) {
          showNotification("Erro ao carregar tarefas", "error");
        }
      }

      // Atualizar também a função updateStatistics para considerar apenas tarefas da loja
      function updateStatistics() {
        try {
          // Filtrar tarefas pela loja atual
          let storeId;
          if (!currentUser.isAdmin) {
            const currentEmployee = employees.find(
              (emp) => emp.id === currentUser.employeeId
            );
            storeId = currentEmployee?.store_id;
          } else {
            storeId = document.getElementById("filterStore")?.value;
          }

          // Filtrar tarefas pela loja se houver store_id
          const filteredTasks = storeId
            ? tasks.filter((task) => task.store_id === parseInt(storeId))
            : tasks;

          // Calcular estatísticas apenas com as tarefas filtradas
          const totalTasks = filteredTasks.length;
          const completedTasks = filteredTasks.filter(
            (t) => t.status === "concluido"
          ).length;

          // Filtrar funcionários ativos da loja
          const activeEmployees = employees.filter((emp) => {
            return (
              (!storeId || emp.store_id === parseInt(storeId)) && !emp.on_leave
            );
          }).length;

          // Atualizar elementos na interface
          document.getElementById("totalTasks").textContent = totalTasks;
          document.getElementById("completedTasks").textContent =
            completedTasks;
          document.getElementById("activeEmployees").textContent =
            activeEmployees;
        } catch (error) {
        }
      }

      function closeTaskModal() {
        const modal = document.getElementById("taskModal");
        modal.style.display = "none";

        // Limpar todos os campos
        document.getElementById("taskName").value = "";
        document.getElementById("taskDescription").value = "";
        document.getElementById("taskPriority").value = "1";
        document.getElementById("assignedTo").innerHTML =
          '<option value="">Distribuição Automática</option>';
        document.getElementById("isFixed").checked = false;

        // Limpar select de loja se for admin
        if (currentUser.isAdmin && document.getElementById("taskStore")) {
          document.getElementById("taskStore").value = "";
        }
      }

      // Sistema de notificações
      function showNotification(message, type = "info") {
        const notification = document.getElementById("notification");

        // Remover classes anteriores
        notification.className = "notification";

        // Adicionar classe do tipo
        notification.classList.add(type);

        // Definir mensagem
        notification.textContent = message;

        // Mostrar notificação
        notification.style.display = "block";
        notification.style.animation = "slideIn 0.3s ease";

        // Configurar temporizador para remover
        const timeout = type === "error" ? 5000 : 3000; // Erros ficam visíveis por mais tempo

        setTimeout(() => {
          // Animação de saída
          notification.style.animation = "slideOut 0.3s ease";

          // Remover após animação
          setTimeout(() => {
            notification.style.display = "none";
          }, 290);
        }, timeout);
      }

      // Função para tratar erros de requisições
      async function handleApiError(response) {
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || "Erro na operação");
        }
        return response;
      }

      // Event Listeners
      document.getElementById("filterDate").addEventListener("change", (e) => {
        selectedDate = e.target.value;
        loadEmployees();
        loadTasks();
      });

      document.getElementById("filterStatus").addEventListener("change", () => {
        loadTasks();
      });

      // Fechar modal ao clicar fora
      window.addEventListener("click", (e) => {
        const modal = document.getElementById("taskModal");
        if (e.target === modal) {
          closeTaskModal();
        }
      });

      // Inicializar aplicação
      init();