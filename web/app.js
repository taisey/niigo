import {ApiError, DataService, RoundsService, TasksService} from '/api-client/index.js';

const validViews = new Set(['dashboard', 'tasks', 'Categories', 'Rounds', 'Members']);
function restoreView() {
  try {
    const saved = localStorage.getItem('niigo:view');
    if (validViews.has(saved)) return saved;
  } catch { /* Storage can be unavailable in restricted browser contexts. */ }
  return 'dashboard';
}
let data = null, view = restoreView(), mobileDashboardStatus = 'Todo', editing = null, closing = null, viewingDetail = null, viewingTaskId = null, draggedTaskId = null, editingAssigneeIds = new Set(), saving = false;
const editor = document.getElementById('editor');
const closer = document.getElementById('closer');
const taskDetail = document.getElementById('taskDetail');
    const labels = { Tasks: 'タスク', Categories: 'カテゴリ', Rounds: 'ラウンド', Members: 'メンバー' };
    const listLabels = { Tasks: 'タスク一覧', Categories: 'カテゴリ一覧', Rounds: 'ラウンド一覧', Members: 'メンバー一覧' };
    const listDescriptions = {
      Tasks: 'タスクは、具体的にやることを一つずつ記録する項目です。',
      Categories: 'カテゴリは、関連するタスクをまとめる単位です。',
      Rounds: 'ラウンドは、一定期間に取り組むタスクをまとめます。',
      Members: 'メンバーは、タスクの担当者として設定できます。'
    };
    const taskStatus = {Todo: '未着手', 'In Progress': '進行中', Done: '完了'};
    const statusClass = {Todo: 'todo', 'In Progress': 'in-progress', Done: 'done'};
    const roundStatus = {Planned: '計画中', Active: '進行中', Closed: '終了'};
    const operations = {
      getData: () => DataService.getData(),
      saveEntity: (name, item, expected) => DataService.saveEntity({requestBody: {name, item, expected}}),
      closeRound: (roundId, destinations, expected) => RoundsService.closeRound({requestBody: {roundId, destinations, expected}}),
      deleteTask: (taskId, expected) => TasksService.deleteTask({taskId, requestBody: {expected}})
    };
    const call = async (name, ...args) => {
      try {
        return await operations[name](...args);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 409) {
          try {
            const latest = await DataService.getData();
            error('');
            return latest;
          } catch {
            throw new Error('シートの最新データを読み込めませんでした。');
          }
        }
        if (caught instanceof ApiError) throw new Error(caught.body?.error || caught.message);
        throw caught;
      }
    };
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function linkify(value) {
      return String(value == null ? '' : value).split(/(https?:\/\/[^\s<>"']+)/g).map(part => {
        if (!/^https?:\/\//i.test(part)) return esc(part);
        const match = part.match(/[.,!?;:，。！？、）】」』]+$/);
        const suffix = match ? match[0] : '';
        const url = suffix ? part.slice(0, -suffix.length) : part;
        return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a>' + esc(suffix);
      }).join('');
    }
    function error(message) { document.getElementById('error').innerHTML = message ? '<div class="error">' + esc(message) + '</div>' : ''; }
    async function load() { try { error(''); data = await call('getData'); render(); } catch (e) { error(e.message || e); document.getElementById('main').textContent = ''; } }
    function nav() {
      const tabs = [['dashboard','ダッシュボード'],['tasks','タスク管理']];
      document.getElementById('nav').innerHTML = tabs.map(([id, label]) => '<button class="' + ((id === 'dashboard' ? view === 'dashboard' : view !== 'dashboard') ? 'active' : '') + '" data-view="' + id + '">' + label + '</button>').join('');
    }
    function taskCard(task) {
      const roundNames = (task.roundIds || []).map(id => data.Rounds.find(round => round.id === id)?.name).filter(Boolean);
      return '<article role="button" tabindex="0" draggable="true" data-drag-task="' + esc(task.id) + '" data-task-detail="' + esc(task.id) + '"><h3>' + esc(task.title) + '</h3>' + categoryBadges(task) + '<div class="task-details">' + statusBadge(task.status) + (roundNames.length ? '<span>🔄 ラウンド: ' + esc(roundNames.join('、')) + '</span>' : '') + (task.due_date ? '<span>期限: ' + esc(task.due_date) + '</span>' : '') + (task.assignees ? '<span>👤 担当者: ' + esc(task.assignees) + '</span>' : '') + '</div>' + (task.description ? '<p>' + esc(task.description) + '</p>' : '') + '</article>';
    }
    function taskListRow(task) {
      const rounds = (task.roundIds || []).map(id => data.Rounds.find(round => round.id === id)?.name).filter(Boolean);
      return '<div class="task-row task-row-clickable" role="button" tabindex="0" data-task-detail="' + esc(task.id) + '"><div class="task-row-heading"><strong>' + esc(task.title) + '</strong><div class="task-actions"><button class="icon-button" aria-label="' + esc(task.title) + 'を編集" title="編集" data-edit="Tasks" data-id="' + esc(task.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="icon-button" aria-label="' + esc(task.title) + 'を削除" title="削除" data-delete-task="' + esc(task.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg></button></div></div>' + categoryBadges(task) + '<div class="task-details">' + statusBadge(task.status) + '<span>🔄 ラウンド: ' + esc(rounds.join('、') || '未設定') + '</span>' + (task.due_date ? '<span>期限: ' + esc(task.due_date) + '</span>' : '') + (task.assignees ? '<span>👤 担当者: ' + esc(task.assignees) + '</span>' : '') + '</div></div>';
    }
    function render() {
      nav();
      const main = document.getElementById('main');
      if (view === 'dashboard') {
        const active = data.Rounds.filter(r => r.status === 'Active');
        const tasks = data.Tasks.filter(task => active.some(round => task.roundIds.includes(round.id)));
        const heading = active.length ? '🔄 ラウンド: ' + active.map(round => round.name).join('、') : '進行中のラウンドはありません';
        const mobileTasks = tasks.filter(task => task.status === mobileDashboardStatus);
        main.innerHTML = '<div class="toolbar"><div><h2>ダッシュボード</h2><p class="muted">' + esc(heading) + '</p><p class="muted dashboard-desktop-hint">タスクカードをドラッグしてステータスを変更できます。</p></div></div>' + (active.length ? '<div class="mobile-status-tabs">' + Object.entries(taskStatus).map(([status, label]) => '<button class="' + (mobileDashboardStatus === status ? 'active' : '') + '" data-mobile-status="' + status + '">' + label + '</button>').join('') + '</div><section class="mobile-dashboard-column"><h3>' + esc(taskStatus[mobileDashboardStatus]) + '<span class="count">' + mobileTasks.length + '</span></h3><div class="kanban-cards">' + (mobileTasks.length ? mobileTasks.map(taskCard).join('') : '<div class="empty">タスクはありません。</div>') + '</div></section><div class="kanban">' + Object.entries(taskStatus).map(([status, label]) => {
          const statusTasks = tasks.filter(task => task.status === status);
          return '<section class="kanban-column" data-drop-status="' + esc(status) + '"><h3>' + esc(label) + '<span class="count">' + statusTasks.length + '</span></h3><div class="kanban-cards">' + (statusTasks.length ? statusTasks.map(taskCard).join('') : '<div class="empty">タスクはありません。</div>') + '</div></section>';
        }).join('') + '</div>' : '<div class="empty">ラウンド管理から進行中のラウンドを設定してください。</div>');
      } else if (view === 'tasks') {
        main.innerHTML = '<h2>タスク管理</h2><div class="subnav"><button class="active" data-view="tasks">' + listLabels.Tasks + '</button><button data-view="Categories">' + listLabels.Categories + '</button><button data-view="Rounds">' + listLabels.Rounds + '</button><button data-view="Members">' + listLabels.Members + '</button></div><div class="toolbar"><div><div class="task-list-heading"><h3>' + listLabels.Tasks + '</h3><button class="icon-button primary" aria-label="タスクを追加" title="タスクを追加" data-edit="Tasks"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div><p class="muted">' + listDescriptions.Tasks + '</p></div></div>' + (data.Tasks.length ? '<div class="task-list">' + data.Tasks.map(taskListRow).join('') + '</div>' : '<div class="empty">タスクはありません。</div>');
      } else {
        const name = view;
        main.innerHTML = '<h2>タスク管理</h2><div class="subnav"><button data-view="tasks">' + listLabels.Tasks + '</button><button class="' + (name === 'Categories' ? 'active' : '') + '" data-view="Categories">' + listLabels.Categories + '</button><button class="' + (name === 'Rounds' ? 'active' : '') + '" data-view="Rounds">' + listLabels.Rounds + '</button><button class="' + (name === 'Members' ? 'active' : '') + '" data-view="Members">' + listLabels.Members + '</button></div><div class="toolbar"><div><div class="task-list-heading"><h3>' + listLabels[name] + '</h3><button class="icon-button primary" aria-label="' + labels[name] + 'を追加" title="' + labels[name] + 'を追加" data-edit="' + name + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div><p class="muted">' + listDescriptions[name] + '</p></div></div>' +
          (data[name].length ? '<div class="panel">' + data[name].map(item => {
            const categoryTasks = name === 'Categories' ? data.Tasks.filter(task => (task.categoryIds || []).includes(item.id)) : [];
            const categoryTitle = name === 'Categories' ? '<div class="category-title"><span class="folder-icon" aria-hidden="true">📁</span><strong>' + esc(item.name) + '</strong><span class="category-count">' + categoryTasks.length + '件</span></div>' : '';
            const title = name === 'Categories' ? categoryTitle : '<strong>' + esc(item.name) + '</strong>';
            const rowActions = name === 'Categories'
              ? '<div class="row-actions"><button class="icon-button" aria-label="' + esc(item.name) + 'を編集" title="編集" data-edit="Categories" data-id="' + esc(item.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="icon-button" aria-label="' + esc(item.name) + 'にタスクを追加" title="タスクに追加" data-add-task-category="' + esc(item.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>'
              : '<div><button data-edit="' + name + '" data-id="' + esc(item.id) + '">編集</button> ' + (name === 'Rounds' && item.status !== 'Closed' ? '<button data-close="' + esc(item.id) + '">終了</button>' : '') + '</div>';
            return '<div class="row ' + (name === 'Categories' ? 'category-row" role="button" tabindex="0" data-category-detail="' + esc(item.id) : '') + '"><div class="row-main">' + title + (name === 'Rounds' ? ' <span class="muted">' + esc(roundStatus[item.status] || item.status) + '</span>' : '') + (item.description ? '<div class="muted">' + esc(item.description) + '</div>' : '') + '</div>' + rowActions + '</div>';
          }).join('') + '</div>' : '<div class="empty">まだありません。</div>');
      }
    }
    function categoryBadges(task) {
      const categories = data.Categories.filter(category => (task.categoryIds || []).includes(category.id));
      return categories.length ? '<div class="task-categories"><span class="task-detail-label">カテゴリ:</span>' + categories.map(category => '<span class="category-badge"><span aria-hidden="true">📁</span> ' + esc(category.name) + '</span>').join('') + '</div>' : '';
    }
    function statusBadge(status) {
      return '<span class="status-badge status-' + (statusClass[status] || 'unknown') + '">ステータス: ' + esc(taskStatus[status] || status || '未設定') + '</span>';
    }
    function openTaskDetail(id) {
      const task = data.Tasks.find(item => item.id === id);
      if (!task) return;
      viewingDetail = {name: 'Tasks', id};
      viewingTaskId = id;
      const categories = data.Categories.filter(item => (task.categoryIds || []).includes(item.id)).map(item => item.name);
      const rounds = data.Rounds.filter(item => (task.roundIds || []).includes(item.id)).map(item => item.name);
      document.getElementById('taskDetailContent').innerHTML = '<h2>' + esc(task.title) + '</h2><dl class="task-detail-list">' +
        '<dt>ステータス</dt><dd>' + statusBadge(task.status) + '</dd>' +
        '<dt>👤 担当者</dt><dd>' + esc(task.assignees || '未設定') + '</dd>' +
        '<dt>カテゴリ</dt><dd>' + esc(categories.join('、') || '未設定') + '</dd>' +
        '<dt>🔄 ラウンド</dt><dd>' + esc(rounds.join('、') || '未設定') + '</dd>' +
        '<dt>期限</dt><dd>' + esc(task.due_date || '未設定') + '</dd>' +
        '<dt>詳細</dt><dd class="task-detail-description">' + linkify(task.description || '詳細はありません。') + '</dd></dl>' +
        '<div class="mobile-status-editor"><label>ステータス<select id="detailTaskStatus">' + Object.entries(taskStatus).map(([status, label]) => '<option value="' + status + '" ' + (task.status === status ? 'selected' : '') + '>' + label + '</option>').join('') + '</select></label><button type="button" class="primary" data-save-task-status="' + esc(task.id) + '">ステータスを保存</button></div>';
      if (!taskDetail.open) taskDetail.showModal();
    }
    function openCategoryDetail(id) {
      const category = data.Categories.find(item => item.id === id);
      if (!category) return;
      viewingDetail = {name: 'Categories', id};
      const tasks = data.Tasks.filter(task => (task.categoryIds || []).includes(id));
      document.getElementById('taskDetailContent').innerHTML = '<h2>📁 ' + esc(category.name) + '</h2><dl class="task-detail-list"><dt>説明</dt><dd>' + esc(category.description || '説明はありません。') + '</dd><dt>タスク</dt><dd>' + (tasks.length ? tasks.map(task => '<button class="task-link" data-task-detail="' + esc(task.id) + '">' + esc(task.title) + '</button>').join(' ') : 'タスクはありません。') + '</dd></dl>';
      if (!taskDetail.open) taskDetail.showModal();
    }
    async function saveTaskStatus(id) {
      const task = data.Tasks.find(item => item.id === id);
      const status = document.getElementById('detailTaskStatus')?.value;
      if (!task || !Object.hasOwn(taskStatus, status) || status === task.status) return;
      const item = {...task, status};
      try {
        data = await call('saveEntity', 'Tasks', item, JSON.stringify(task));
        render();
        openTaskDetail(id);
        error('');
      } catch (err) { error(err.message || err); }
    }
    function select(name, choices, chosen, multiple) {
      const selected = new Set(chosen || []);
      return '<label>' + name + '<select name="' + name + '" ' + (multiple ? 'multiple' : '') + '>' + (multiple ? '' : '<option value="">なし</option>') + choices.map(c => '<option value="' + esc(c.id) + '" ' + (selected.has(c.id) ? 'selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label>';
    }
    function assigneePicker(chosen) {
      editingAssigneeIds = new Set(chosen || []);
      return '<fieldset class="assignee-picker"><legend>担当者</legend><div id="assigneeChips"></div>' +
        (data.Members.length ? '<label class="assignee-search-label">メンバーを検索して追加<input id="assigneeSearch" type="search" autocomplete="off" placeholder="名前を入力"></label><div id="assigneeMatches" class="assignee-matches"></div>' :
          '<span class="muted">メンバー管理からメンバーを追加してください。</span>') + '</fieldset>';
    }
    function refreshAssigneePicker() {
      const chips = document.getElementById('assigneeChips');
      if (!chips) return;
      chips.innerHTML = [...editingAssigneeIds].map(id => {
        const member = data.Members.find(item => item.id === id);
        return member ? '<span class="assignee-chip">' + esc(member.name) + '<button type="button" aria-label="' + esc(member.name) + 'を担当から外す" data-remove-assignee="' + esc(id) + '">×</button></span>' : '';
      }).join('') || '<span class="muted">担当者未設定</span>';
      const input = document.getElementById('assigneeSearch');
      const matches = document.getElementById('assigneeMatches');
      if (!input || !matches) return;
      const query = input.value.trim().toLocaleLowerCase();
      matches.innerHTML = query
        ? data.Members.filter(member => !editingAssigneeIds.has(member.id) && member.name.toLocaleLowerCase().includes(query))
          .map(member => '<button type="button" class="assignee-match" data-add-assignee="' + esc(member.id) + '">' + esc(member.name) + '</button>').join('')
        : '';
    }
    function field(label, name, value, type = 'text') { return '<label>' + label + (type === 'textarea' ? '<textarea name="' + name + '">' + esc(value) + '</textarea>' : '<input name="' + name + '" type="' + type + '" value="' + esc(value) + '">') + '</label>'; }
    function openEditor(name, id, defaults = {}) {
      editing = { name, item: id ? data[name].find(x => x.id === id) : null, defaults };
      const item = editing.item || defaults;
      document.getElementById('editorTitle').textContent = (id ? '編集: ' : '追加: ') + labels[name];
      let html = '';
      if (name === 'Tasks') {
        html += field('タスク名', 'title', item.title || '');
        html += field('詳細', 'description', item.description || '', 'textarea');
        html += field('期限', 'due_date', item.due_date || '', 'date');
        html += '<label>ステータス<select name="status">' + Object.entries(taskStatus).map(([key, label]) => '<option value="' + key + '" ' + ((item.status || 'Todo') === key ? 'selected' : '') + '>' + label + '</option>').join('') + '</select></label>';
        html += assigneePicker(item.assigneesIds);
        html += select('カテゴリ', data.Categories, item.categoryIds).replace('name="カテゴリ"', 'name="categoryIds"');
        html += select('ラウンド', data.Rounds.filter(r => r.status !== 'Closed' || item.roundIds?.includes(r.id)), item.roundIds).replace('name="ラウンド"', 'name="roundIds"');
      } else {
        html += field('名前', 'name', item.name || '');
        if (name !== 'Members') html += field('説明', 'description', item.description || '', 'textarea');
        if (name === 'Rounds') {
          html += field('開始日', 'start_date', item.start_date || '', 'date') + field('終了日', 'end_date', item.end_date || '', 'date');
          html += '<label>ステータス<select name="status">' + Object.entries(roundStatus).filter(([key]) => key !== 'Closed' || item.status === 'Closed').map(([key,label]) => '<option value="' + key + '" ' + ((item.status || 'Planned') === key ? 'selected' : '') + '>' + label + '</option>').join('') + '</select></label>';
        }
      }
      document.getElementById('fields').innerHTML = html;
      refreshAssigneePicker();
      document.getElementById('deleteTask').hidden = !(name === 'Tasks' && Boolean(id));
      editor.showModal();
    }
    document.getElementById('deleteTask').addEventListener('click', async () => {
      if (!editing?.item || editing.name !== 'Tasks') return;
      if (!confirm('「' + editing.item.title + '」を削除します。よろしいですか？')) return;
      try {
        data = await call('deleteTask', editing.item.id, JSON.stringify(editing.item));
        editor.close();
        error('');
        render();
      } catch (err) { error(err.message || err); }
    });
    async function deleteTaskFromList(id) {
      const task = data.Tasks.find(item => item.id === id);
      if (!task || !confirm('「' + task.title + '」を削除します。よろしいですか？')) return;
      try { data = await call('deleteTask', task.id, JSON.stringify(task)); error(''); render(); }
      catch (err) { error(err.message || err); }
    }
    document.getElementById('editForm').addEventListener('submit', async e => {
      e.preventDefault();
      if (saving) return;
      saving = true;
      const submitButton = e.target.querySelector('button[type="submit"]');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = '保存中…'; }
      const form = e.target, name = editing.name, old = editing.item;
      const item = { id: old?.id || '' };
      for (const field of (name === 'Tasks' ? ['title','description','due_date','status'] : name === 'Rounds' ? ['name','description','start_date','end_date','status'] : name === 'Categories' ? ['name','description'] : ['name'])) item[field] = form.elements[field].value;
      if (name === 'Tasks') {
        item.assigneesIds = [...editingAssigneeIds];
        for (const field of ['categoryIds','roundIds']) item[field] = [...form.elements[field].selectedOptions].map(o => o.value).filter(Boolean);
      }
      try { data = await call('saveEntity', name, item, old ? JSON.stringify(old) : ''); editor.close(); error(''); render(); }
      catch (err) { error(err.message || err); }
      finally { saving = false; if (submitButton) { submitButton.disabled = false; submitButton.textContent = '保存'; } }
    });
    function openClose(id) {
      closing = data.Rounds.find(r => r.id === id);
      const tasks = data.Tasks.filter(t => t.roundIds.includes(id) && t.status !== 'Done');
      const choices = data.Rounds.filter(r => r.id !== id && r.status !== 'Closed');
      document.getElementById('closeFields').innerHTML = tasks.length ? tasks.map(t => '<label>' + esc(t.title) + '<select data-task="' + esc(t.id) + '"><option value="">Backlog</option>' + choices.map(r => '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>').join('') + '</select></label>').join('') : '<p>移動するタスクはありません。</p>';
      closer.showModal();
    }
    document.getElementById('closeForm').addEventListener('submit', async e => {
      e.preventDefault();
      const destinations = {};
      document.querySelectorAll('#closeFields select').forEach(select => { destinations[select.dataset.task] = select.value; });
      try { data = await call('closeRound', closing.id, destinations, JSON.stringify(closing)); closer.close(); error(''); render(); } catch (err) { error(err.message || err); }
    });
    document.getElementById('reload').addEventListener('click', load);
    document.getElementById('editTaskFromDetail').addEventListener('click', () => {
      if (!viewingDetail) return;
      taskDetail.close();
      openEditor(viewingDetail.name, viewingDetail.id);
    });
    document.addEventListener('input', event => {
      if (event.target.id === 'assigneeSearch') refreshAssigneePicker();
    });
    document.addEventListener('dragstart', event => {
      const card = event.target.closest('article[data-drag-task]');
      if (!card) return;
      draggedTaskId = card.dataset.dragTask;
      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedTaskId);
    });
    document.addEventListener('dragend', event => {
      event.target.closest('article[data-drag-task]')?.classList.remove('dragging');
      document.querySelectorAll('.kanban-column.drag-over').forEach(column => column.classList.remove('drag-over'));
      draggedTaskId = null;
    });
    document.addEventListener('dragover', event => {
      const column = event.target.closest('.kanban-column[data-drop-status]');
      if (!column) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.kanban-column.drag-over').forEach(item => { if (item !== column) item.classList.remove('drag-over'); });
      column.classList.add('drag-over');
    });
    document.addEventListener('drop', async event => {
      const column = event.target.closest('.kanban-column[data-drop-status]');
      if (!column) return;
      event.preventDefault();
      column.classList.remove('drag-over');
      const id = event.dataTransfer.getData('text/plain') || draggedTaskId;
      const task = data.Tasks.find(item => item.id === id);
      const status = column.dataset.dropStatus;
      if (!task || task.status === status) return;
      const item = {id: task.id, title: task.title, description: task.description, due_date: task.due_date, status, assigneesIds: task.assigneesIds, categoryIds: task.categoryIds, roundIds: task.roundIds};
      try { data = await call('saveEntity', 'Tasks', item, JSON.stringify(task)); error(''); render(); }
      catch (err) { error(err.message || err); }
    });
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-view], [data-edit], [data-close], [data-dismiss], [data-add-task-category], [data-delete-task], [data-add-assignee], [data-remove-assignee], [data-task-detail], [data-category-detail], [data-mobile-status], [data-save-task-status]');
      if (!button) return;
      if (button.dataset.addAssignee) {
        editingAssigneeIds.add(button.dataset.addAssignee);
        const search = document.getElementById('assigneeSearch');
        if (search) search.value = '';
        refreshAssigneePicker();
      }
      else if (button.dataset.removeAssignee) { editingAssigneeIds.delete(button.dataset.removeAssignee); refreshAssigneePicker(); }
      else if (button.dataset.view) {
        view = button.dataset.view;
        try { localStorage.setItem('niigo:view', view); } catch { /* Keep navigation working without storage. */ }
        render();
      }
      else if (button.dataset.mobileStatus) { mobileDashboardStatus = button.dataset.mobileStatus; render(); }
      else if (button.dataset.saveTaskStatus) saveTaskStatus(button.dataset.saveTaskStatus);
      else if (button.dataset.deleteTask) deleteTaskFromList(button.dataset.deleteTask);
      else if (button.dataset.addTaskCategory) openEditor('Tasks', null, {categoryIds: [button.dataset.addTaskCategory]});
      else if (button.dataset.taskDetail) openTaskDetail(button.dataset.taskDetail);
      else if (button.dataset.categoryDetail) openCategoryDetail(button.dataset.categoryDetail);
      else if (button.dataset.edit) openEditor(button.dataset.edit, button.dataset.id);
      else if (button.dataset.close) openClose(button.dataset.close);
      else if (button.dataset.dismiss) document.getElementById(button.dataset.dismiss).close();
    });
    document.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-task-detail][role="button"], [data-category-detail][role="button"]')) {
        event.preventDefault();
        if (event.target.dataset.categoryDetail) openCategoryDetail(event.target.dataset.categoryDetail);
        else openTaskDetail(event.target.dataset.taskDetail);
      }
    });
    load();
