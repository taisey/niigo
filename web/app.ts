import {ApiError, DataService, RoundsService, TasksService} from '/api-client/index.js';
import type {DataSnapshot, Round, Task} from '/api-client/index.js';

type EntityName = keyof DataSnapshot;
type EditableItem = Record<string, any>;
type View = 'dashboard' | 'tasks' | 'Categories' | 'Rounds' | 'Members';

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

const validViews = new Set<View>(['dashboard', 'tasks', 'Categories', 'Rounds', 'Members']);
function restoreView(): View {
  try {
    const saved = localStorage.getItem('niigo:view');
    if (saved && validViews.has(saved as View)) return saved as View;
  } catch { /* Storage can be unavailable in restricted browser contexts. */ }
  return 'dashboard';
}
let data: DataSnapshot = {Tasks: [], Categories: [], Rounds: [], Members: []};
let view: View = restoreView(), mobileDashboardStatus = 'Todo';
const taskFilters = {categoryId: '', roundId: ''};
const unsetFilter = '__unset__';
let editing: {name: EntityName; item: EditableItem | null; defaults: EditableItem} | null = null;
let closing: Round | null = null;
let switchingTo: Round | null = null;
let viewingDetail: {name: EntityName; id: string} | null = null;
let viewingTaskId: string | null = null, draggedTaskId: string | null = null;
let draggedGroup: {id: string; taskId: string} | null = null;
let touchDrag: {pointerId: number; startX: number; startY: number; groupId: string; taskId: string; handle: HTMLElement; moved: boolean} | null = null;
const expandedGroups = new Set<string>();
let editingAssigneeIds = new Set<string>(), saving = false;
const editor = element('editor') as HTMLDialogElement;
const closer = element('closer') as HTMLDialogElement;
const taskDetail = element('taskDetail') as HTMLDialogElement;
    const labels = { Tasks: 'タスク', Categories: 'カテゴリ', Rounds: 'ラウンド', Members: 'メンバー' };
    const listLabels = { Tasks: 'タスク一覧', Categories: 'カテゴリ一覧', Rounds: 'ラウンド一覧', Members: 'メンバー一覧' };
    const listDescriptions = {
      Tasks: 'タスクは、具体的にやることを一つずつ記録する項目です。',
      Categories: 'カテゴリをクリックするとタスク一覧が開きます。⠿ をドラッグして順番を変更できます。',
      Rounds: 'ラウンドをクリックすると、タスクをカテゴリ別に確認できます。',
      Members: 'メンバーは、タスクの担当者として設定できます。'
    };
    const taskStatus: Record<string, string> = {Todo: '未着手', 'In Progress': '進行中', Done: '完了'};
    const statusClass: Record<string, string> = {Todo: 'todo', 'In Progress': 'in-progress', Done: 'done'};
    const roundStatus: Record<string, string> = {Planned: '計画中', Active: '進行中', Closed: '終了'};
    type SaveRequest = Parameters<typeof DataService.saveEntity>[0]['requestBody'];
    type ReorderRequest = Parameters<typeof TasksService.reorderTask>[0]['requestBody'];
    const operations: Record<string, (...args: any[]) => PromiseLike<DataSnapshot>> = {
      getData: () => DataService.getData(),
      saveEntity: (name: EntityName, item: EditableItem, expected: string) => DataService.saveEntity({requestBody: {name, item, expected} as SaveRequest}),
      closeRound: (roundId: string, destinations: Record<string, string>, expected: string, activateRoundId?: string) => RoundsService.closeRound({requestBody: {roundId, destinations, expected, activateRoundId}}),
      deleteTask: (taskId: string, expected: string) => TasksService.deleteTask({taskId, requestBody: {expected}}),
      reorderTask: (taskId: string, beforeTaskId: string, groupId: string, expectedOrder: string[]) => TasksService.reorderTask({requestBody: {taskId, beforeTaskId, group: 'Categories', groupId, expectedOrder} as ReorderRequest})
    };
    const call = async (name: keyof typeof operations, ...args: any[]): Promise<DataSnapshot> => {
      try {
        return await operations[name](...args);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 409) {
          try {
            data = await DataService.getData();
            render();
          } catch {
            throw new Error('シートの最新データを読み込めませんでした。');
          }
          throw new Error('シートが変更されました。画面を閉じて、最新の内容でやり直してください。');
        }
        if (caught instanceof ApiError) throw new Error(caught.body?.error || caught.message);
        throw caught;
      }
    };
    const escapes: Record<string, string> = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
    const esc = (value: unknown) => String(value == null ? '' : value).replace(/[&<>"']/g, c => escapes[c]);
    function linkify(value: unknown) {
      return String(value == null ? '' : value).split(/(https?:\/\/[^\s<>"']+)/g).map(part => {
        if (!/^https?:\/\//i.test(part)) return esc(part);
        const match = part.match(/[.,!?;:，。！？、）】」』]+$/);
        const suffix = match ? match[0] : '';
        const url = suffix ? part.slice(0, -suffix.length) : part;
        return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a>' + esc(suffix);
      }).join('');
    }
    function error(message: unknown) { element('error').innerHTML = message ? '<div class="error">' + esc(message) + '</div>' : ''; }
    async function load() { try { error(''); data = await call('getData'); render(); } catch (e) { error(errorMessage(e)); element('main').textContent = ''; } }
    function nav() {
      const tabs = [['dashboard','ダッシュボード'],['tasks','タスク管理']];
      element('nav').innerHTML = tabs.map(([id, label]) => '<button class="' + ((id === 'dashboard' ? view === 'dashboard' : view !== 'dashboard') ? 'active' : '') + '" data-view="' + id + '">' + label + '</button>').join('');
    }
    function taskCard(task: Task) {
      return '<article class="kanban-task-row" role="button" tabindex="0" draggable="true" data-drag-task="' + esc(task.id) + '" data-task-detail="' + esc(task.id) + '"><strong>' + esc(task.title) + '</strong>' + (task.due_date ? '<span class="muted">期限: ' + esc(task.due_date) + '</span>' : '') + (task.assignees ? '<span class="muted">👤 ' + esc(task.assignees) + '</span>' : '') + '</article>';
    }
    function taskListRow(task: Task) {
      const rounds = (task.roundIds || []).map(id => data.Rounds.find(round => round.id === id)?.name).filter(Boolean);
      return '<div class="task-row task-row-clickable" role="button" tabindex="0" data-task-detail="' + esc(task.id) + '"><div class="task-row-heading"><strong>' + esc(task.title) + '</strong><div class="task-actions"><button class="icon-button" aria-label="' + esc(task.title) + 'を編集" title="編集" data-edit="Tasks" data-id="' + esc(task.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="icon-button" aria-label="' + esc(task.title) + 'を削除" title="削除" data-delete-task="' + esc(task.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg></button></div></div>' + categoryBadges(task) + '<div class="task-details">' + statusBadge(task.status) + '<span>🔄 ラウンド: ' + esc(rounds.join('、') || '未設定') + '</span>' + (task.due_date ? '<span>期限: ' + esc(task.due_date) + '</span>' : '') + (task.assignees ? '<span>👤 担当者: ' + esc(task.assignees) + '</span>' : '') + '</div></div>';
    }
    function filteredTasks() {
      return data.Tasks.filter(task =>
        (!taskFilters.categoryId || (taskFilters.categoryId === unsetFilter
          ? !task.categoryIds.some(id => data.Categories.some(category => category.id === id))
          : task.categoryIds.includes(taskFilters.categoryId))) &&
        (!taskFilters.roundId || (taskFilters.roundId === unsetFilter
          ? !task.roundIds.some(id => data.Rounds.some(round => round.id === id))
          : task.roundIds.includes(taskFilters.roundId)))
      );
    }
    function taskFilterSelect(kind: 'category' | 'round') {
      const isCategory = kind === 'category';
      const label = isCategory ? 'カテゴリ' : 'ラウンド';
      const selected = isCategory ? taskFilters.categoryId : taskFilters.roundId;
      const choices = isCategory ? data.Categories : data.Rounds;
      return '<label>' + label + '<select data-task-filter="' + kind + '"><option value="">すべての' + label + '</option>' +
        choices.map(item => '<option value="' + esc(item.id) + '"' + (selected === item.id ? ' selected' : '') + '>' + esc(item.name) + '</option>').join('') +
        '<option value="' + unsetFilter + '"' + (selected === unsetFilter ? ' selected' : '') + '>未設定</option></select></label>';
    }
    function tasksByCategory(tasks: Task[]) {
      const groups = data.Categories.map(category => ({id: category.id, name: category.name, tasks: tasks.filter(task => task.categoryIds.includes(category.id))})).filter(group => group.tasks.length);
      const uncategorized = tasks.filter(task => !task.categoryIds.some(id => data.Categories.some(category => category.id === id)));
      if (uncategorized.length) groups.push({id: '', name: 'カテゴリ未設定', tasks: uncategorized});
      return groups;
    }
    function groupedTaskCards(tasks: Task[]) {
      return tasksByCategory(tasks).map(group => '<section class="kanban-category"><h4>📁 ' + esc(group.name) + '</h4>' + group.tasks.map(taskCard).join('') + '</section>').join('');
    }
    function groupTaskRow(task: Task, reorderable: boolean) {
      return '<div class="group-task-row"' + (reorderable ? ' data-reorder-task="' + esc(task.id) + '"' : '') + '>' +
        (reorderable ? '<button type="button" class="drag-handle" draggable="true" data-drag-reorder="' + esc(task.id) + '" aria-label="' + esc(task.title) + 'の順番を変更" title="ドラッグ、または上下矢印キーで並べ替え">⠿</button>' : '') +
        '<button type="button" class="group-task-title" data-task-detail="' + esc(task.id) + '">' + esc(task.title) + '</button>' +
        statusBadge(task.status) + (task.due_date ? '<span class="muted group-task-date">期限: ' + esc(task.due_date) + '</span>' : '') + '</div>';
    }
    function groupTaskList(name: 'Categories' | 'Rounds', id: string, tasks: Task[]) {
      const key = name + ':' + id;
      const content = name === 'Categories' ? tasks.map(task => groupTaskRow(task, true)).join('')
        : tasksByCategory(tasks).map(group => '<section class="round-category"><h4>📁 ' + esc(group.name) + '</h4>' + group.tasks.map(task => groupTaskRow(task, false)).join('') + '</section>').join('');
      return '<div id="group-tasks-' + esc(key) + '" class="group-task-list"' + (name === 'Categories' ? ' data-reorder-group="Categories" data-group-id="' + esc(id) + '"' : '') + (expandedGroups.has(key) ? '' : ' hidden') + '>' +
        (tasks.length ? content : '<div class="group-task-empty">タスクはありません。</div>') + '</div>';
    }
    function groupDropTarget(x: number, y: number, groupId: string, taskId: string) {
      const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('.group-task-row[data-reorder-task]');
      const list = row?.closest<HTMLElement>('[data-reorder-group][data-group-id]');
      if (!row || !list || list.dataset.groupId !== groupId || row.dataset.reorderTask === taskId) return null;
      const after = y >= row.getBoundingClientRect().top + row.offsetHeight / 2;
      const ids = Array.from(list.querySelectorAll<HTMLElement>('[data-reorder-task]')).map(item => item.dataset.reorderTask!).filter(id => id !== taskId);
      const index = ids.indexOf(row.dataset.reorderTask!);
      return {row, beforeId: after ? ids[index + 1] || '' : row.dataset.reorderTask!, after};
    }
    async function reorderGroupTask(groupId: string, taskId: string, beforeTaskId: string) {
      const expectedOrder = data.Tasks.filter(task => task.categoryIds.includes(groupId)).map(task => task.id);
      const nextOrder = expectedOrder.filter(id => id !== taskId);
      nextOrder.splice(beforeTaskId ? nextOrder.indexOf(beforeTaskId) : nextOrder.length, 0, taskId);
      if (expectedOrder.join('\0') === nextOrder.join('\0')) return;
      try { data = await call('reorderTask', taskId, beforeTaskId, groupId, expectedOrder); error(''); render(); }
      catch (err) { error(errorMessage(err)); }
    }
    function render() {
      nav();
      if (taskFilters.categoryId !== unsetFilter && !data.Categories.some(category => category.id === taskFilters.categoryId)) taskFilters.categoryId = '';
      if (taskFilters.roundId !== unsetFilter && !data.Rounds.some(round => round.id === taskFilters.roundId)) taskFilters.roundId = '';
      const main = element('main');
      if (view === 'dashboard') {
        const active = data.Rounds.filter(r => r.status === 'Active');
        const tasks = data.Tasks.filter(task => active.some(round => task.roundIds.includes(round.id)));
        const heading = active.length ? '🔄 ラウンド: ' + active.map(round => round.name).join('、') : '進行中のラウンドはありません';
        const mobileTasks = tasks.filter(task => task.status === mobileDashboardStatus);
        main.innerHTML = '<div class="toolbar"><div><h2>ダッシュボード</h2><p class="muted">' + esc(heading) + '</p><p class="muted dashboard-desktop-hint">タスクをドラッグしてステータスを変更できます。</p></div></div>' + (active.length ? '<div class="mobile-status-tabs">' + Object.entries(taskStatus).map(([status, label]) => '<button class="' + (mobileDashboardStatus === status ? 'active' : '') + '" data-mobile-status="' + status + '">' + label + '</button>').join('') + '</div><section class="mobile-dashboard-column"><h3>' + esc(taskStatus[mobileDashboardStatus]) + '<span class="count">' + mobileTasks.length + '</span></h3><div class="kanban-cards">' + (mobileTasks.length ? groupedTaskCards(mobileTasks) : '<div class="empty">タスクはありません。</div>') + '</div></section><div class="kanban">' + Object.entries(taskStatus).map(([status, label]) => {
          const statusTasks = tasks.filter(task => task.status === status);
          return '<section class="kanban-column" data-drop-status="' + esc(status) + '"><h3>' + esc(label) + '<span class="count">' + statusTasks.length + '</span></h3><div class="kanban-cards">' + (statusTasks.length ? groupedTaskCards(statusTasks) : '<div class="empty">タスクはありません。</div>') + '</div></section>';
        }).join('') + '</div>' : '<div class="empty">ラウンド管理から進行中のラウンドを設定してください。</div>');
      } else if (view === 'tasks') {
        const tasks = filteredTasks();
        main.innerHTML = '<h2>タスク管理</h2><div class="subnav"><button class="active" data-view="tasks">' + listLabels.Tasks + '</button><button data-view="Categories">' + listLabels.Categories + '</button><button data-view="Rounds">' + listLabels.Rounds + '</button><button data-view="Members">' + listLabels.Members + '</button></div><div class="toolbar"><div><div class="task-list-heading"><h3>' + listLabels.Tasks + '</h3><button class="icon-button primary" aria-label="タスクを追加" title="タスクを追加" data-edit="Tasks"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div><p class="muted">' + listDescriptions.Tasks + '</p></div></div>' +
          '<div class="task-filters">' + taskFilterSelect('category') + taskFilterSelect('round') + '<span class="muted task-filter-count">' + tasks.length + '件 / 全' + data.Tasks.length + '件</span></div>' +
          (tasks.length ? '<div class="task-list">' + tasks.map(taskListRow).join('') + '</div>' : '<div class="empty">' + (data.Tasks.length ? '条件に合うタスクはありません。' : 'タスクはありません。') + '</div>');
      } else {
        const name = view;
        main.innerHTML = '<h2>タスク管理</h2><div class="subnav"><button data-view="tasks">' + listLabels.Tasks + '</button><button class="' + (name === 'Categories' ? 'active' : '') + '" data-view="Categories">' + listLabels.Categories + '</button><button class="' + (name === 'Rounds' ? 'active' : '') + '" data-view="Rounds">' + listLabels.Rounds + '</button><button class="' + (name === 'Members' ? 'active' : '') + '" data-view="Members">' + listLabels.Members + '</button></div><div class="toolbar"><div><div class="task-list-heading"><h3>' + listLabels[name] + '</h3><button class="icon-button primary" aria-label="' + labels[name] + 'を追加" title="' + labels[name] + 'を追加" data-edit="' + name + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div><p class="muted">' + listDescriptions[name] + '</p></div></div>' +
          (data[name].length ? '<div class="panel">' + data[name].map(item => {
            const grouped = name === 'Categories' || name === 'Rounds';
            const groupTasks = grouped ? data.Tasks.filter(task => (name === 'Categories' ? task.categoryIds : task.roundIds).includes(item.id)) : [];
            const categoryTitle = name === 'Categories' ? '<div class="category-title"><span class="folder-icon" aria-hidden="true">📁</span><strong>' + esc(item.name) + '</strong><span class="category-count">' + groupTasks.length + '件</span></div>' : '';
            const itemStatus = 'status' in item ? item.status : '';
            const title = name === 'Categories' ? categoryTitle : name === 'Rounds'
              ? '<div class="category-title"><strong>' + esc(item.name) + '</strong><span class="category-count">' + groupTasks.length + '件</span><span class="muted">' + esc(roundStatus[itemStatus] || itemStatus) + '</span></div>'
              : '<strong>' + esc(item.name) + '</strong>';
            const description = 'description' in item ? item.description : '';
            const rowActions = name === 'Categories'
              ? '<div class="row-actions"><button class="icon-button" aria-label="' + esc(item.name) + 'を編集" title="編集" data-edit="Categories" data-id="' + esc(item.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="icon-button" aria-label="' + esc(item.name) + 'にタスクを追加" title="タスクに追加" data-add-task-category="' + esc(item.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>'
              : '<div><button data-edit="' + name + '" data-id="' + esc(item.id) + '">編集</button> ' + (name === 'Rounds' && itemStatus === 'Planned' && data.Rounds.some(round => round.status === 'Active') ? '<button data-switch-round="' + esc(item.id) + '">切り替える</button> ' : '') + (name === 'Rounds' && itemStatus !== 'Closed' ? '<button data-close="' + esc(item.id) + '">終了</button>' : '') + '</div>';
            const content = title + (description ? '<div class="muted">' + esc(description) + '</div>' : '');
            const key = name + ':' + item.id;
            const main = grouped
              ? '<button type="button" class="group-toggle row-main" data-toggle-group="' + name + '" data-group-id="' + esc(item.id) + '" aria-expanded="' + expandedGroups.has(key) + '" aria-controls="group-tasks-' + esc(key) + '"><span class="group-chevron" aria-hidden="true">⌄</span><div class="group-toggle-content">' + content + '</div></button>'
              : '<div class="row-main">' + content + '</div>';
            return '<section class="group-section"><div class="row">' + main + rowActions + '</div>' + (name === 'Categories' || name === 'Rounds' ? groupTaskList(name, item.id, groupTasks) : '') + '</section>';
          }).join('') + '</div>' : '<div class="empty">まだありません。</div>');
      }
    }
    function categoryBadges(task: Task) {
      const categories = data.Categories.filter(category => (task.categoryIds || []).includes(category.id));
      return categories.length ? '<div class="task-categories"><span class="task-detail-label">カテゴリ:</span>' + categories.map(category => '<span class="category-badge"><span aria-hidden="true">📁</span> ' + esc(category.name) + '</span>').join('') + '</div>' : '';
    }
    function statusBadge(status: string) {
      return '<span class="status-badge status-' + (statusClass[status] || 'unknown') + '">ステータス: ' + esc(taskStatus[status] || status || '未設定') + '</span>';
    }
    function openTaskDetail(id: string) {
      const task = data.Tasks.find(item => item.id === id);
      if (!task) return;
      viewingDetail = {name: 'Tasks', id};
      viewingTaskId = id;
      const categories = data.Categories.filter(item => (task.categoryIds || []).includes(item.id)).map(item => item.name);
      const rounds = data.Rounds.filter(item => (task.roundIds || []).includes(item.id)).map(item => item.name);
      element('taskDetailTitle').textContent = task.title;
      element('editTaskFromDetail').setAttribute('aria-label', task.title + 'を編集');
      element('taskDetailContent').innerHTML = '<dl class="task-detail-list">' +
        '<dt>ステータス</dt><dd>' + statusBadge(task.status) + '</dd>' +
        '<dt>👤 担当者</dt><dd>' + esc(task.assignees || '未設定') + '</dd>' +
        '<dt>カテゴリ</dt><dd>' + esc(categories.join('、') || '未設定') + '</dd>' +
        '<dt>🔄 ラウンド</dt><dd>' + esc(rounds.join('、') || '未設定') + '</dd>' +
        '<dt>期限</dt><dd>' + esc(task.due_date || '未設定') + '</dd>' +
        '<dt>詳細</dt><dd class="task-detail-description">' + linkify(task.description || '詳細はありません。') + '</dd></dl>' +
        '<div class="mobile-status-editor"><label>ステータス<select id="detailTaskStatus">' + Object.entries(taskStatus).map(([status, label]) => '<option value="' + status + '" ' + (task.status === status ? 'selected' : '') + '>' + label + '</option>').join('') + '</select></label><button type="button" class="primary" data-save-task-status="' + esc(task.id) + '">ステータスを保存</button></div>';
      if (!taskDetail.open) taskDetail.showModal();
      taskDetail.scrollTop = 0;
    }
    async function saveTaskStatus(id: string) {
      const task = data.Tasks.find(item => item.id === id);
      const status = (element('detailTaskStatus') as HTMLSelectElement | null)?.value;
      if (!task || !status || !Object.hasOwn(taskStatus, status) || status === task.status) return;
      const item = {...task, status};
      try {
        data = await call('saveEntity', 'Tasks', item, JSON.stringify(task));
        render();
        openTaskDetail(id);
        error('');
      } catch (err) { error(errorMessage(err)); }
    }
    function select(name: string, choices: Array<{id: string; name: string}>, chosen: string[] = [], multiple = false) {
      const selected = new Set(chosen || []);
      return '<label>' + name + '<select name="' + name + '" ' + (multiple ? 'multiple' : '') + '>' + (multiple ? '' : '<option value="">なし</option>') + choices.map(c => '<option value="' + esc(c.id) + '" ' + (selected.has(c.id) ? 'selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label>';
    }
    function assigneePicker(chosen?: string[]) {
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
      const input = document.getElementById('assigneeSearch') as HTMLInputElement | null;
      const matches = document.getElementById('assigneeMatches');
      if (!input || !matches) return;
      const query = input.value.trim().toLocaleLowerCase();
      matches.innerHTML = query
        ? data.Members.filter(member => !editingAssigneeIds.has(member.id) && member.name.toLocaleLowerCase().includes(query))
          .map(member => '<button type="button" class="assignee-match" data-add-assignee="' + esc(member.id) + '">' + esc(member.name) + '</button>').join('')
        : '';
    }
    function field(label: string, name: string, value: unknown, type = 'text') { return '<label>' + label + (type === 'textarea' ? '<textarea name="' + name + '">' + esc(value) + '</textarea>' : '<input name="' + name + '" type="' + type + '" value="' + esc(value) + '">') + '</label>'; }
    function openEditor(name: EntityName, id: string | null, defaults: EditableItem = {}) {
      const current = id ? data[name].find(x => x.id === id) ?? null : null;
      editing = {name, item: current, defaults};
      const item: EditableItem = current || defaults;
      element('editorTitle').textContent = (id ? '編集: ' : '追加: ') + labels[name];
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
      element('fields').innerHTML = html;
      refreshAssigneePicker();
      element('deleteTask').hidden = !(name === 'Tasks' && Boolean(id));
      editor.showModal();
    }
    element('deleteTask').addEventListener('click', async () => {
      if (!editing?.item || editing.name !== 'Tasks') return;
      if (!confirm('「' + editing.item.title + '」を削除します。よろしいですか？')) return;
      try {
        data = await call('deleteTask', editing.item.id, JSON.stringify(editing.item));
        editor.close();
        error('');
        render();
      } catch (err) { error(errorMessage(err)); }
    });
    async function deleteTaskFromList(id: string) {
      const task = data.Tasks.find(item => item.id === id);
      if (!task || !confirm('「' + task.title + '」を削除します。よろしいですか？')) return;
      try { data = await call('deleteTask', task.id, JSON.stringify(task)); error(''); render(); }
      catch (err) { error(errorMessage(err)); }
    }
    element('editForm').addEventListener('submit', async e => {
      e.preventDefault();
      const activeEditing = editing;
      if (saving || !activeEditing) return;
      saving = true;
      const form = e.currentTarget as HTMLFormElement;
      const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = '保存中…'; }
      const name = activeEditing.name, old = activeEditing.item;
      const item: EditableItem = {id: old?.id || ''};
      for (const field of (name === 'Tasks' ? ['title','description','due_date','status'] : name === 'Rounds' ? ['name','description','start_date','end_date','status'] : name === 'Categories' ? ['name','description'] : ['name'])) item[field] = (form.elements.namedItem(field) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
      if (name === 'Tasks') {
        item.assigneesIds = [...editingAssigneeIds];
        for (const field of ['categoryIds','roundIds']) item[field] = Array.from((form.elements.namedItem(field) as HTMLSelectElement).selectedOptions).map(o => o.value).filter(Boolean);
      }
      try { data = await call('saveEntity', name, item, old ? JSON.stringify(old) : ''); editor.close(); error(''); render(); }
      catch (err) { error(errorMessage(err)); }
      finally { saving = false; if (submitButton) { submitButton.disabled = false; submitButton.textContent = '保存'; } }
    });
    function openClose(id: string) {
      switchingTo = null;
      closing = data.Rounds.find(r => r.id === id) ?? null;
      if (!closing) return;
      element('closeTitle').textContent = 'ラウンドを終了';
      element('closeDescription').textContent = '未完了のタスクごとに移動先を選んでください。完了したタスクはこのラウンドに残ります。';
      element('closeSubmit').textContent = '終了する';
      const tasks = data.Tasks.filter(t => t.roundIds.includes(id) && t.status !== 'Done');
      const choices = data.Rounds.filter(r => r.id !== id && r.status !== 'Closed');
      element('closeFields').innerHTML = tasks.length ? tasks.map(t => '<label>' + esc(t.title) + '<select data-task="' + esc(t.id) + '"><option value="">タスク一覧（ラウンドなし）</option>' + choices.map(r => '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>').join('') + '</select></label>').join('') : '<p>移動するタスクはありません。</p>';
      closer.showModal();
    }
    function openSwitch(id: string) {
      switchingTo = data.Rounds.find(round => round.id === id && round.status === 'Planned') ?? null;
      closing = data.Rounds.find(round => round.status === 'Active') ?? null;
      if (!switchingTo || !closing) return;
      element('closeTitle').textContent = 'ラウンドを切り替える';
      element('closeDescription').textContent = '「' + closing.name + '」を終了し、「' + switchingTo.name + '」を進行中にします。引き継がない未完了タスクはラウンド未設定になり、完了したタスクは元のラウンドに残ります。';
      element('closeSubmit').textContent = '切り替える';
      const tasks = data.Tasks.filter(task => task.roundIds.includes(closing!.id) && task.status !== 'Done');
      element('closeFields').innerHTML = tasks.length ? tasks.map(task => '<label class="switch-task"><input type="checkbox" data-task="' + esc(task.id) + '" checked> ' + esc(task.title) + '</label>').join('') : '<p>引き継ぐ未完了タスクはありません。</p>';
      closer.showModal();
    }
    element('closeForm').addEventListener('submit', async e => {
      e.preventDefault();
      const currentClosing = closing;
      if (!currentClosing) return;
      const destinations: Record<string, string> = {};
      if (switchingTo) {
        document.querySelectorAll<HTMLInputElement>('#closeFields input[data-task]').forEach(input => { destinations[input.dataset.task!] = input.checked ? switchingTo!.id : ''; });
      } else {
        document.querySelectorAll<HTMLSelectElement>('#closeFields select').forEach(select => { if (select.dataset.task) destinations[select.dataset.task] = select.value; });
      }
      try { data = await call('closeRound', currentClosing.id, destinations, JSON.stringify(currentClosing), switchingTo?.id); closer.close(); error(''); render(); } catch (err) { error(errorMessage(err)); }
    });
    element('reload').addEventListener('click', load);
    element('editTaskFromDetail').addEventListener('click', () => {
      if (!viewingDetail) return;
      taskDetail.close();
      openEditor(viewingDetail.name, viewingDetail.id);
    });
    document.addEventListener('input', event => {
      if ((event.target as HTMLElement).id === 'assigneeSearch') refreshAssigneePicker();
    });
    document.addEventListener('change', event => {
      const select = (event.target as HTMLElement).closest<HTMLSelectElement>('select[data-task-filter]');
      if (!select) return;
      if (select.dataset.taskFilter === 'category') taskFilters.categoryId = select.value;
      else taskFilters.roundId = select.value;
      render();
      document.querySelector<HTMLSelectElement>('select[data-task-filter="' + select.dataset.taskFilter + '"]')?.focus();
    });
    document.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse') return;
      const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-drag-reorder]');
      const list = handle?.closest<HTMLElement>('[data-reorder-group][data-group-id]');
      if (!handle || !list) return;
      touchDrag = {pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
        groupId: list.dataset.groupId!,
        taskId: handle.dataset.dragReorder!, handle, moved: false};
      handle.setPointerCapture(event.pointerId);
    });
    document.addEventListener('pointermove', event => {
      if (!touchDrag || event.pointerId !== touchDrag.pointerId) return;
      if (!touchDrag.moved && Math.hypot(event.clientX - touchDrag.startX, event.clientY - touchDrag.startY) < 8) return;
      touchDrag.moved = true;
      document.querySelectorAll('.group-task-row.drag-before, .group-task-row.drag-after').forEach(row => row.classList.remove('drag-before', 'drag-after'));
      const target = groupDropTarget(event.clientX, event.clientY, touchDrag.groupId, touchDrag.taskId);
      target?.row.classList.add(target.after ? 'drag-after' : 'drag-before');
    });
    document.addEventListener('pointerup', event => {
      if (!touchDrag || event.pointerId !== touchDrag.pointerId) return;
      const drag = touchDrag;
      touchDrag = null;
      document.querySelectorAll('.group-task-row.drag-before, .group-task-row.drag-after').forEach(row => row.classList.remove('drag-before', 'drag-after'));
      if (!drag.moved) return;
      const target = groupDropTarget(event.clientX, event.clientY, drag.groupId, drag.taskId);
      if (target) void reorderGroupTask(drag.groupId, drag.taskId, target.beforeId);
    });
    document.addEventListener('pointercancel', event => {
      if (touchDrag?.pointerId === event.pointerId) touchDrag = null;
      document.querySelectorAll('.group-task-row.drag-before, .group-task-row.drag-after').forEach(row => row.classList.remove('drag-before', 'drag-after'));
    });
    document.addEventListener('dragstart', event => {
      const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-drag-reorder]');
      const list = handle?.closest<HTMLElement>('[data-reorder-group][data-group-id]');
      if (handle && list && event.dataTransfer) {
        draggedGroup = {id: list.dataset.groupId!, taskId: handle.dataset.dragReorder!};
        handle.closest('.group-task-row')?.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedGroup.taskId);
        return;
      }
      const card = (event.target as HTMLElement).closest<HTMLElement>('article[data-drag-task]');
      if (!card) return;
      draggedTaskId = card.dataset.dragTask || null;
      if (!draggedTaskId || !event.dataTransfer) return;
      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedTaskId);
    });
    document.addEventListener('dragend', event => {
      (event.target as HTMLElement).closest('article[data-drag-task]')?.classList.remove('dragging');
      document.querySelectorAll('.kanban-column.drag-over').forEach(column => column.classList.remove('drag-over'));
      document.querySelectorAll('.group-task-row.dragging, .group-task-row.drag-before, .group-task-row.drag-after').forEach(row => row.classList.remove('dragging', 'drag-before', 'drag-after'));
      draggedTaskId = null;
      draggedGroup = null;
    });
    document.addEventListener('dragover', event => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('.group-task-row[data-reorder-task]');
      const list = row?.closest<HTMLElement>('[data-reorder-group][data-group-id]');
      if (row && list && draggedGroup && list.dataset.groupId === draggedGroup.id && event.dataTransfer) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.group-task-row.drag-before, .group-task-row.drag-after').forEach(item => item.classList.remove('drag-before', 'drag-after'));
        if (row.dataset.reorderTask !== draggedGroup.taskId) row.classList.add(event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2 ? 'drag-before' : 'drag-after');
        return;
      }
      const column = (event.target as HTMLElement).closest<HTMLElement>('.kanban-column[data-drop-status]');
      if (!column || !event.dataTransfer) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.kanban-column.drag-over').forEach(item => { if (item !== column) item.classList.remove('drag-over'); });
      column.classList.add('drag-over');
    });
    document.addEventListener('drop', async event => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('.group-task-row[data-reorder-task]');
      const list = row?.closest<HTMLElement>('[data-reorder-group][data-group-id]');
      if (row && list && draggedGroup && list.dataset.groupId === draggedGroup.id) {
        event.preventDefault();
        const group = draggedGroup;
        const target = groupDropTarget(event.clientX, event.clientY, group.id, group.taskId);
        draggedGroup = null;
        document.querySelectorAll('.group-task-row.drag-before, .group-task-row.drag-after').forEach(item => item.classList.remove('drag-before', 'drag-after'));
        if (target) await reorderGroupTask(group.id, group.taskId, target.beforeId);
        return;
      }
      const column = (event.target as HTMLElement).closest<HTMLElement>('.kanban-column[data-drop-status]');
      if (!column || !event.dataTransfer) return;
      event.preventDefault();
      column.classList.remove('drag-over');
      const id = event.dataTransfer.getData('text/plain') || draggedTaskId;
      const task = data.Tasks.find(item => item.id === id);
      const status = column.dataset.dropStatus;
      if (!task || task.status === status) return;
      const item = {id: task.id, title: task.title, description: task.description, due_date: task.due_date, status, assigneesIds: task.assigneesIds, categoryIds: task.categoryIds, roundIds: task.roundIds};
      try { data = await call('saveEntity', 'Tasks', item, JSON.stringify(task)); error(''); render(); }
      catch (err) { error(errorMessage(err)); }
    });
    document.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-view], [data-edit], [data-close], [data-switch-round], [data-dismiss], [data-add-task-category], [data-delete-task], [data-add-assignee], [data-remove-assignee], [data-task-detail], [data-toggle-group], [data-mobile-status], [data-save-task-status]');
      if (!button) return;
      if (button.dataset.addAssignee) {
        editingAssigneeIds.add(button.dataset.addAssignee);
        const search = element('assigneeSearch') as HTMLInputElement | null;
        if (search) search.value = '';
        refreshAssigneePicker();
      }
      else if (button.dataset.removeAssignee) { editingAssigneeIds.delete(button.dataset.removeAssignee); refreshAssigneePicker(); }
      else if (button.dataset.view && validViews.has(button.dataset.view as View)) {
        view = button.dataset.view as View;
        try { localStorage.setItem('niigo:view', view); } catch { /* Keep navigation working without storage. */ }
        render();
      }
      else if (button.dataset.mobileStatus) { mobileDashboardStatus = button.dataset.mobileStatus; render(); }
      else if (button.dataset.saveTaskStatus) saveTaskStatus(button.dataset.saveTaskStatus);
      else if (button.dataset.deleteTask) deleteTaskFromList(button.dataset.deleteTask);
      else if (button.dataset.addTaskCategory) openEditor('Tasks', null, {categoryIds: [button.dataset.addTaskCategory]});
      else if (button.dataset.taskDetail) openTaskDetail(button.dataset.taskDetail);
      else if (button.dataset.toggleGroup && button.dataset.groupId) {
        const key = button.dataset.toggleGroup + ':' + button.dataset.groupId;
        const list = document.getElementById('group-tasks-' + key);
        if (!list) return;
        const expanded = !expandedGroups.has(key);
        if (expanded) expandedGroups.add(key); else expandedGroups.delete(key);
        list.hidden = !expanded;
        button.setAttribute('aria-expanded', String(expanded));
      }
      else if (button.dataset.edit) openEditor(button.dataset.edit as EntityName, button.dataset.id || null);
      else if (button.dataset.close) openClose(button.dataset.close);
      else if (button.dataset.switchRound) openSwitch(button.dataset.switchRound);
      else if (button.dataset.dismiss) (element(button.dataset.dismiss) as HTMLDialogElement).close();
    });
    document.addEventListener('keydown', event => {
      const target = event.target as HTMLElement;
      const handle = target.closest<HTMLElement>('[data-drag-reorder]');
      const list = handle?.closest<HTMLElement>('[data-reorder-group][data-group-id]');
      if (handle && list && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        const ids = Array.from(list.querySelectorAll<HTMLElement>('[data-reorder-task]')).map(item => item.dataset.reorderTask!);
        const taskId = handle.dataset.dragReorder!;
        const index = ids.indexOf(taskId);
        const beforeId = event.key === 'ArrowUp' ? ids[index - 1] : ids[index + 2] || '';
        if ((event.key === 'ArrowUp' && index > 0) || (event.key === 'ArrowDown' && index >= 0 && index < ids.length - 1)) {
          void reorderGroupTask(list.dataset.groupId!, taskId, beforeId);
        }
        return;
      }
      if ((event.key === 'Enter' || event.key === ' ') && target.matches('[data-task-detail][role="button"]')) {
        event.preventDefault();
        if (target.dataset.taskDetail) openTaskDetail(target.dataset.taskDetail);
      }
    });
    load();
