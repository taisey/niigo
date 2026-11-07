import {useCallback, useEffect, useState} from 'react';
import type {DataSnapshot, Task} from '../api-generated/index.js';
import {Button} from '@/components/button';
import Dashboard from '@/features/dashboard/Dashboard';
import TaskManagement from '@/features/task-management/TaskManagement';
import TaskDetail from '@/features/task-management/tasks/TaskDetail';
import TaskEditor, {type Editing} from '@/features/task-management/tasks/TaskEditor';
import RoundCloseDialog from '@/features/task-management/rounds/RoundCloseDialog';
import {api, errorMessage, isConflict} from '@/lib/api';
import {emptyData, taskPayload, type EditableItem, type EntityName, type View} from '@/lib/model';

const validViews = new Set<View>(['dashboard', 'tasks', 'Categories', 'Rounds', 'Members']);
function restoreView(): View {
  try {
    const stored = localStorage.getItem('niigo:view');
    if (stored && validViews.has(stored as View)) return stored as View;
  } catch { /* Browsers may restrict storage. */ }
  return 'dashboard';
}

export default function App() {
  const [data, setData] = useState<DataSnapshot>(emptyData);
  const [view, setView] = useState<View>(restoreView);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [taskDetailId, setTaskDetailId] = useState<string | null>(null);
  const [roundAction, setRoundAction] = useState<{closingId: string; switchingToId?: string} | null>(null);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try { setData(await api.getData()); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const mutate = async (request: () => Promise<DataSnapshot>): Promise<boolean> => {
    try {
      setData(await request());
      setError('');
      return true;
    } catch (caught) {
      if (isConflict(caught)) {
        try { setData(await api.getData()); }
        catch { setError('シートの最新データを読み込めませんでした。'); return false; }
        setError('シートが変更されました。画面を閉じて、最新の内容でやり直してください。');
      } else setError(errorMessage(caught));
      return false;
    }
  };
  const changeView = (next: View) => {
    setView(next);
    try { localStorage.setItem('niigo:view', next); } catch { /* Navigation still works. */ }
  };
  const openEditor = (name: EntityName, id?: string, defaults: EditableItem = {}) => {
    const current = id ? data[name].find(item => item.id === id) : null;
    setEditing({name, item: current ? current as unknown as EditableItem : null, defaults});
  };
  const save = (name: EntityName, item: EditableItem, old: EditableItem | null) =>
    mutate(() => api.saveEntity(name, item, old ? JSON.stringify(old) : ''));
  const deleteTask = async (id: string): Promise<boolean> => {
    const task = data.Tasks.find(item => item.id === id);
    if (!task || !window.confirm(`「${task.title}」を削除します。よろしいですか？`)) return false;
    const deleted = await mutate(() => api.deleteTask(id, JSON.stringify(task)));
    if (deleted) setTaskDetailId(null);
    return deleted;
  };
  const statusChange = (task: Task, status: string) =>
    mutate(() => api.saveEntity('Tasks', taskPayload(task, status), JSON.stringify(task)));
  const reorder = (groupId: string, taskId: string, beforeId: string) => {
    const expectedOrder = data.Tasks.filter(task => task.categoryIds.includes(groupId)).map(task => task.id);
    const nextOrder = expectedOrder.filter(id => id !== taskId);
    nextOrder.splice(beforeId ? nextOrder.indexOf(beforeId) : nextOrder.length, 0, taskId);
    if (expectedOrder.join('\0') === nextOrder.join('\0')) return;
    void mutate(() => api.reorderTask(taskId, beforeId, groupId, expectedOrder));
  };
  const closing = roundAction ? data.Rounds.find(round => round.id === roundAction.closingId) : null;
  const switchingTo = roundAction?.switchingToId ? data.Rounds.find(round => round.id === roundAction.switchingToId) || null : null;
  const detailTask = taskDetailId ? data.Tasks.find(task => task.id === taskDetailId) || null : null;

  return <div className="app-shell">
    <header className="app-header"><h1 className="brand"><img src="/niigo-logo.svg" alt="NIIGO" width="690" height="220" /></h1>
      <Button variant="outline" onClick={() => void load()}>更新</Button>
    </header>
    {error && <div role="alert" className="error">{error}</div>}
    <nav className="main-nav" aria-label="メイン">
      <Button variant={view === 'dashboard' ? 'default' : 'outline'} onClick={() => changeView('dashboard')}>ダッシュボード</Button>
      <Button variant={view !== 'dashboard' ? 'default' : 'outline'} onClick={() => changeView('tasks')}>タスク管理</Button>
    </nav>
    <main aria-live="polite">
      {loading ? '読み込み中…' : view === 'dashboard'
        ? <Dashboard data={data} onOpenTask={setTaskDetailId} onStatusChange={(task, status) => { void statusChange(task, status); }} />
        : <TaskManagement data={data} view={view} onView={changeView} onEdit={openEditor} onOpenTask={setTaskDetailId}
            onDeleteTask={id => { void deleteTask(id); }} onCloseRound={id => setRoundAction({closingId: id})}
            onSwitchRound={id => {
              const active = data.Rounds.find(round => round.status === 'Active');
              if (active) setRoundAction({closingId: active.id, switchingToId: id});
            }} onReorder={reorder} />}
    </main>
    {detailTask && <TaskDetail key={`${detailTask.id}:${detailTask.status}`} task={detailTask} data={data} onClose={() => setTaskDetailId(null)}
      onEdit={id => { setTaskDetailId(null); openEditor('Tasks', id); }}
      onStatusSave={statusChange} />}
    <TaskEditor editing={editing} data={data} onClose={() => setEditing(null)} onSave={save} onDelete={deleteTask} />
    {closing && <RoundCloseDialog key={`${closing.id}:${switchingTo?.id || 'close'}`} data={data} closing={closing} switchingTo={switchingTo}
      onClose={() => setRoundAction(null)}
      onSubmit={destinations => mutate(() => api.closeRound(closing.id, destinations, JSON.stringify(closing), switchingTo?.id))} />}
  </div>;
}
