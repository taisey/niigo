let data = null, view = 'current', editing = null, closing = null;
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
      const tabs = [['current','今のラウンド'],['backlog','Backlog'],['Categories','カテゴリ'],['Rounds','ラウンド'],['Members','メンバー']];
      document.getElementById('nav').innerHTML = tabs.map(([id, label]) => '<button class="' + (view === id ? 'active' : '') + '" data-view="' + id + '">' + label + '</button>').join('');
    }
    function render() {
      nav();
      const main = document.getElementById('main');
      if (view === 'current' || view === 'backlog') {
        const active = data.Rounds.filter(r => r.status === 'Active');
        const tasks = view === 'backlog' ? data.Tasks.filter(t => !t.roundIds.length) : data.Tasks.filter(t => active.some(r => t.roundIds.includes(r.id)));
        const heading = view === 'backlog' ? 'Backlog' : active.length ? '今のラウンド: ' + active.map(r => r.name).join('、') : '今のラウンド';
        main.innerHTML = '<div class="toolbar"><div><h2>' + esc(heading) + '</h2>' + (view === 'current' && !active.length ? '<p class="muted">進行中のラウンドはありません。</p>' : '') + '</div><button class="primary" data-edit="Tasks">タスクを追加</button></div>' +
          (tasks.length ? '<div class="cards">' + tasks.map(t => '<article role="button" tabindex="0" data-edit="Tasks" data-id="' + esc(t.id) + '"><h3>' + esc(t.title) + '</h3><div class="muted">' + esc(taskStatus[t.status] || t.status) + (t.due_date ? ' · 期限 ' + esc(t.due_date) : '') + (t.assignees ? ' · ' + esc(t.assignees) : '') + '</div>' + (t.description ? '<p>' + esc(t.description) + '</p>' : '') + '</article>').join('') + '</div>' : '<div class="empty">タスクはありません。</div>');
      } else {
        const name = view;
        main.innerHTML = '<div class="toolbar"><h2>' + labels[name] + '</h2><button class="primary" data-edit="' + name + '">追加</button></div>' +
          (data[name].length ? '<div class="panel">' + data[name].map(item => '<div class="row"><div><strong>' + esc(item.name) + '</strong>' + (name === 'Rounds' ? ' <span class="muted">' + esc(roundStatus[item.status] || item.status) + '</span>' : '') + (item.description ? '<div class="muted">' + esc(item.description) + '</div>' : '') + '</div><div><button data-edit="' + name + '" data-id="' + esc(item.id) + '">編集</button> ' + (name === 'Rounds' && item.status !== 'Closed' ? '<button data-close="' + esc(item.id) + '">終了</button>' : '') + '</div></div>').join('') + '</div>' : '<div class="empty">まだありません。</div>');
      }
    }
    function select(name, choices, chosen, multiple) {
      const selected = new Set(chosen || []);
      return '<label>' + name + '<select name="' + name + '" ' + (multiple ? 'multiple' : '') + '>' + (multiple ? '' : '<option value="">なし</option>') + choices.map(c => '<option value="' + esc(c.id) + '" ' + (selected.has(c.id) ? 'selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label>';
    }
    function field(label, name, value, type = 'text') { return '<label>' + label + (type === 'textarea' ? '<textarea name="' + name + '">' + esc(value) + '</textarea>' : '<input name="' + name + '" type="' + type + '" value="' + esc(value) + '">') + '</label>'; }
    function openEditor(name, id) {
      editing = { name, item: id ? data[name].find(x => x.id === id) : null };
      const item = editing.item || {};
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
      const button = event.target.closest('[data-view], [data-edit], [data-close], [data-dismiss]');
      if (!button) return;
      if (button.dataset.view) { view = button.dataset.view; render(); }
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
