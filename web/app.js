let data = null, view = 'dashboard', editing = null, closing = null;
const editor = document.getElementById('editor');
const closer = document.getElementById('closer');
    const labels = { Tasks: 'タスク', Categories: 'カテゴリ', Rounds: 'ラウンド', Members: 'メンバー' };
    const taskStatus = {Todo: '未着手', 'In Progress': '進行中', Done: '完了'};
    const roundStatus = {Planned: '計画中', Active: '進行中', Closed: '終了'};
    const call = async (name, ...args) => {
      const paths = {getData: ['GET', '/api/data'], saveEntity: ['POST', '/api/save'], closeRound: ['POST', '/api/rounds/close'], deleteTask: ['DELETE', '/api/tasks/' + encodeURIComponent(args[0])]};
      const [method, path] = paths[name];
      const payload = name === 'saveEntity' ? {name: args[0], item: args[1], expected: args[2]} : name === 'closeRound' ? {roundId: args[0], destinations: args[1], expected: args[2]} : name === 'deleteTask' ? {expected: args[1]} : undefined;
      const response = await fetch(path, {method, headers: {'content-type': 'application/json'}, ...(payload ? {body: JSON.stringify(payload)} : {})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '読み込みに失敗しました。');
      return result;
    };
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function error(message) { document.getElementById('error').innerHTML = message ? '<div class="error">' + esc(message) + '</div>' : ''; }
    async function load() { try { error(''); data = await call('getData'); render(); } catch (e) { error(e.message || e); document.getElementById('main').textContent = ''; } }
    function nav() {
      const tabs = [['dashboard','ダッシュボード'],['tasks','タスク管理']];
      document.getElementById('nav').innerHTML = tabs.map(([id, label]) => '<button class="' + ((id === 'dashboard' ? view === 'dashboard' : view !== 'dashboard') ? 'active' : '') + '" data-view="' + id + '">' + label + '</button>').join('');
    }
    function taskCard(task) {
      const roundNames = (task.roundIds || []).map(id => data.Rounds.find(round => round.id === id)?.name).filter(Boolean);
      return '<article role="button" tabindex="0" data-edit="Tasks" data-id="' + esc(task.id) + '"><h3>' + esc(task.title) + '</h3>' + categoryBadges(task) + '<div class="task-details"><span>ステータス: ' + esc(taskStatus[task.status] || task.status) + '</span>' + (roundNames.length ? '<span>ラウンド: ' + esc(roundNames.join('、')) + '</span>' : '') + (task.due_date ? '<span>期限: ' + esc(task.due_date) + '</span>' : '') + (task.assignees ? '<span>担当者: ' + esc(task.assignees) + '</span>' : '') + '</div>' + (task.description ? '<p>' + esc(task.description) + '</p>' : '') + '</article>';
    }
    function render() {
      nav();
      const main = document.getElementById('main');
      if (view === 'dashboard') {
        const active = data.Rounds.filter(r => r.status === 'Active');
        const tasks = data.Tasks.filter(task => active.some(round => task.roundIds.includes(round.id)));
        const heading = active.length ? active.map(round => round.name).join('、') : '進行中のラウンドはありません';
        main.innerHTML = '<div class="toolbar"><div><h2>ダッシュボード</h2><p class="muted">' + esc(heading) + '</p></div><button class="primary" data-view="tasks">タスク管理</button></div>' + (active.length ? '<div class="kanban">' + Object.entries(taskStatus).map(([status, label]) => {
          const statusTasks = tasks.filter(task => task.status === status);
          return '<section class="kanban-column"><h3>' + esc(label) + '<span class="count">' + statusTasks.length + '</span></h3><div class="kanban-cards">' + (statusTasks.length ? statusTasks.map(taskCard).join('') : '<div class="empty">タスクはありません。</div>') + '</div></section>';
        }).join('') + '</div>' : '<div class="empty">ラウンド管理から進行中のラウンドを設定してください。</div>');
      } else if (view === 'tasks') {
        main.innerHTML = '<div class="subnav"><button class="active" data-view="tasks">タスク一覧</button><button data-view="Categories">カテゴリ管理</button><button data-view="Rounds">ラウンド管理</button><button data-view="Members">メンバー管理</button></div><div class="toolbar"><div><h2>タスク管理</h2><p class="muted">タスクを一覧で確認し、カテゴリやラウンド、担当者を設定できます。</p></div><button class="primary" data-edit="Tasks">タスクを追加</button></div>' + (data.Tasks.length ? '<div class="task-list">' + data.Tasks.map(task => '<div class="task-row"><div class="task-row-main"><strong>' + esc(task.title) + '</strong>' + categoryBadges(task) + '<div class="task-details"><span>ステータス: ' + esc(taskStatus[task.status] || task.status) + '</span>' + ((task.roundIds || []).length ? '<span>ラウンド: ' + esc(task.roundIds.map(id => data.Rounds.find(round => round.id === id)?.name).filter(Boolean).join('、')) + '</span>' : '<span>ラウンド: 未設定</span>') + (task.due_date ? '<span>期限: ' + esc(task.due_date) + '</span>' : '') + (task.assignees ? '<span>担当者: ' + esc(task.assignees) + '</span>' : '') + '</div></div><div class="task-actions"><button data-edit="Tasks" data-id="' + esc(task.id) + '">編集</button><button class="danger" data-delete-task="' + esc(task.id) + '">削除</button></div></div>').join('') + '</div>' : '<div class="empty">タスクはありません。</div>');
      } else {
        const name = view;
        main.innerHTML = '<div class="toolbar"><div><h2>' + labels[name] + '管理</h2></div><button class="primary" data-edit="' + name + '">追加</button></div><div class="subnav"><button data-view="tasks">タスク一覧</button><button class="' + (name === 'Categories' ? 'active' : '') + '" data-view="Categories">カテゴリ管理</button><button class="' + (name === 'Rounds' ? 'active' : '') + '" data-view="Rounds">ラウンド管理</button><button class="' + (name === 'Members' ? 'active' : '') + '" data-view="Members">メンバー管理</button></div>' +
          (data[name].length ? '<div class="panel">' + data[name].map(item => {
            const categoryTasks = name === 'Categories' ? data.Tasks.filter(task => (task.categoryIds || []).includes(item.id)) : [];
            const title = name === 'Categories' ? '<span class="folder-icon" aria-hidden="true">📁</span> ' + esc(item.name) : esc(item.name);
            const includedTasks = name === 'Categories' ? '<div class="category-tasks">' + (categoryTasks.length ? categoryTasks.map(task => '<button class="task-link" data-edit="Tasks" data-id="' + esc(task.id) + '">' + esc(task.title) + '</button>').join('') : '<span class="muted">タスクはありません。</span>') + '</div>' : '';
            return '<div class="row"><div class="row-main"><strong>' + title + '</strong>' + (name === 'Rounds' ? ' <span class="muted">' + esc(roundStatus[item.status] || item.status) + '</span>' : '') + (item.description ? '<div class="muted">' + esc(item.description) + '</div>' : '') + includedTasks + '</div><div>' + (name === 'Categories' ? '<button data-add-task-category="' + esc(item.id) + '">このカテゴリでタスクを追加</button> ' : '') + '<button data-edit="' + name + '" data-id="' + esc(item.id) + '">編集</button> ' + (name === 'Rounds' && item.status !== 'Closed' ? '<button data-close="' + esc(item.id) + '">終了</button>' : '') + '</div></div>';
          }).join('') + '</div>' : '<div class="empty">まだありません。</div>');
      }
    }
    function categoryBadges(task) {
      const categories = data.Categories.filter(category => (task.categoryIds || []).includes(category.id));
      return categories.length ? '<div class="task-categories"><span class="task-detail-label">カテゴリ:</span>' + categories.map(category => '<span class="category-badge"><span aria-hidden="true">📁</span> ' + esc(category.name) + '</span>').join('') + '</div>' : '';
    }
    function select(name, choices, chosen, multiple) {
      const selected = new Set(chosen || []);
      return '<label>' + name + '<select name="' + name + '" ' + (multiple ? 'multiple' : '') + '>' + (multiple ? '' : '<option value="">なし</option>') + choices.map(c => '<option value="' + esc(c.id) + '" ' + (selected.has(c.id) ? 'selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label>';
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
        html += select('担当者', data.Members, item.assigneesIds, true).replace('name="担当者"', 'name="assigneesIds"');
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
      const form = e.target, name = editing.name, old = editing.item;
      const item = { id: old?.id || '' };
      for (const field of (name === 'Tasks' ? ['title','description','due_date','status'] : name === 'Rounds' ? ['name','description','start_date','end_date','status'] : name === 'Categories' ? ['name','description'] : ['name'])) item[field] = form.elements[field].value;
      if (name === 'Tasks') for (const field of ['assigneesIds','categoryIds','roundIds']) item[field] = [...form.elements[field].selectedOptions].map(o => o.value).filter(Boolean);
      try { data = await call('saveEntity', name, item, old ? JSON.stringify(old) : ''); editor.close(); error(''); render(); } catch (err) { error(err.message || err); }
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
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-view], [data-edit], [data-close], [data-dismiss], [data-add-task-category], [data-delete-task]');
      if (!button) return;
      if (button.dataset.view) { view = button.dataset.view; render(); }
      else if (button.dataset.deleteTask) deleteTaskFromList(button.dataset.deleteTask);
      else if (button.dataset.addTaskCategory) openEditor('Tasks', null, {categoryIds: [button.dataset.addTaskCategory]});
      else if (button.dataset.edit) openEditor(button.dataset.edit, button.dataset.id);
      else if (button.dataset.close) openClose(button.dataset.close);
      else if (button.dataset.dismiss) document.getElementById(button.dataset.dismiss).close();
    });
    document.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('article[data-edit]')) {
        event.preventDefault(); openEditor(event.target.dataset.edit, event.target.dataset.id);
      }
    });
    load();
