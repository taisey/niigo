import {useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent} from 'react';
import type {DataSnapshot, Task} from '../../../api-generated/index.js';
import {Button} from '@/components/button';
import {Card} from '@/components/card';
import {NativeSelect, NativeSelectOption} from '@/components/native-select';
import {Plus, Pencil, Trash2, ChevronDown, GripVertical} from 'lucide-react';
import {CategoryBadges, StatusBadge} from './tasks/TaskParts';
import {labels, listDescriptions, listLabels, roundStatus, taskStatus, tasksByCategory, unsetFilter, validLinkedIds, type EntityName, type View} from '@/lib/model';

type Props = {
  data: DataSnapshot;
  view: Exclude<View, 'dashboard'>;
  onView: (view: View) => void;
  onEdit: (name: EntityName, id?: string, defaults?: Record<string, unknown>) => void;
  onOpenTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onCloseRound: (id: string) => void;
  onSwitchRound: (id: string) => void;
  onReorder: (groupId: string, taskId: string, beforeId: string) => void;
};

const sections: Array<Exclude<View, 'dashboard'>> = ['tasks', 'Categories', 'Rounds', 'Members'];
const entityOf = (view: Exclude<View, 'dashboard'>): EntityName => view === 'tasks' ? 'Tasks' : view;

function StatusFilter({value, onChange, label = 'ステータス'}: {value: string; onChange: (value: string) => void; label?: string}) {
  return <label>{label}<NativeSelect value={value} onChange={event => onChange(event.target.value)}>
    <NativeSelectOption value="">すべてのステータス</NativeSelectOption>
    {Object.entries(taskStatus).map(([status, text]) => <NativeSelectOption key={status} value={status}>{text}</NativeSelectOption>)}
  </NativeSelect></label>;
}

function TaskRow({task, data, onOpenTask, onEdit, onDeleteTask}: Pick<Props, 'data' | 'onOpenTask' | 'onEdit' | 'onDeleteTask'> & {task: Task}) {
  const rounds = task.roundIds.map(id => data.Rounds.find(round => round.id === id)?.name).filter(Boolean);
  const open = () => onOpenTask(task.id);
  return <div className="task-row task-row-clickable" role="button" tabIndex={0} onClick={open}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }}>
    <div className="task-row-heading"><strong>{task.title}</strong>
      <div className="task-actions">
        <Button variant="outline" size="icon-sm" aria-label={`${task.title}を編集`} title="編集" onClick={event => { event.stopPropagation(); onEdit('Tasks', task.id); }}><Pencil /></Button>
        <Button variant="outline" size="icon-sm" aria-label={`${task.title}を削除`} title="削除" onClick={event => { event.stopPropagation(); onDeleteTask(task.id); }}><Trash2 /></Button>
      </div>
    </div>
    <CategoryBadges task={task} data={data} />
    <div className="task-details"><StatusBadge status={task.status} /><span>🔄 ラウンド: {rounds.join('、') || '未設定'}</span>
      {task.due_date && <span>期限: {task.due_date}</span>}{task.assignees && <span>👤 担当者: {task.assignees}</span>}
    </div>
  </div>;
}

export default function TaskManagement(props: Props) {
  const {data, view, onView, onEdit, onOpenTask, onDeleteTask, onCloseRound, onSwitchRound, onReorder} = props;
  const [categoryId, setCategoryId] = useState('');
  const [roundId, setRoundId] = useState('');
  const [status, setStatus] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const dragging = useRef<{groupId: string; taskId: string} | null>(null);
  const touchDrag = useRef<{pointerId: number; groupId: string; taskId: string; x: number; y: number; moved: boolean} | null>(null);
  const name = entityOf(view);
  const selectedCategory = categoryId === unsetFilter || data.Categories.some(item => item.id === categoryId) ? categoryId : '';
  const selectedRound = roundId === unsetFilter || data.Rounds.some(item => item.id === roundId) ? roundId : '';
  const filteredTasks = data.Tasks.filter(task =>
    (!selectedCategory || (selectedCategory === unsetFilter ? !validLinkedIds(task.categoryIds, data.Categories) : task.categoryIds.includes(selectedCategory))) &&
    (!selectedRound || (selectedRound === unsetFilter ? !validLinkedIds(task.roundIds, data.Rounds) : task.roundIds.includes(selectedRound))) &&
    (!status || task.status === status)
  );
  const items = (name === 'Categories' && status
    ? data.Categories.filter(category => data.Tasks.some(task => task.categoryIds.includes(category.id) && task.status === status))
    : data[name]) as Array<{id: string; name: string; description?: string; status?: string}>;

  const toggle = (key: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const reorderTarget = (target: Element | null, y: number, groupId: string, taskId: string) => {
    const row = target?.closest<HTMLElement>('[data-reorder-task]');
    const list = row?.closest<HTMLElement>('[data-reorder-group]');
    if (!row || !list || list.dataset.groupId !== groupId || row.dataset.reorderTask === taskId) return null;
    const after = y >= row.getBoundingClientRect().top + row.offsetHeight / 2;
    const ids = Array.from(list.querySelectorAll<HTMLElement>('[data-reorder-task]')).map(item => item.dataset.reorderTask!).filter(id => id !== taskId);
    const index = ids.indexOf(row.dataset.reorderTask!);
    return {beforeId: after ? ids[index + 1] || '' : row.dataset.reorderTask!, row, after};
  };
  const dragOver = (event: DragEvent<HTMLElement>, groupId: string) => {
    if (!dragging.current || dragging.current.groupId !== groupId) return;
    event.preventDefault();
    const target = reorderTarget(event.target as Element, event.clientY, groupId, dragging.current.taskId);
    document.querySelectorAll('.group-task-row.drag-before, .group-task-row.drag-after').forEach(row => row.classList.remove('drag-before', 'drag-after'));
    target?.row.classList.add(target.after ? 'drag-after' : 'drag-before');
  };
  const drop = (event: DragEvent<HTMLElement>, groupId: string) => {
    if (!dragging.current || dragging.current.groupId !== groupId) return;
    event.preventDefault();
    const {taskId} = dragging.current;
    const target = reorderTarget(event.target as Element, event.clientY, groupId, taskId);
    dragging.current = null;
    document.querySelectorAll('.group-task-row.drag-before, .group-task-row.drag-after').forEach(row => row.classList.remove('drag-before', 'drag-after'));
    if (target) onReorder(groupId, taskId, target.beforeId);
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = touchDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
    drag.moved = true;
    const target = reorderTarget(document.elementFromPoint(event.clientX, event.clientY), event.clientY, drag.groupId, drag.taskId);
    document.querySelectorAll('.group-task-row.drag-before, .group-task-row.drag-after').forEach(row => row.classList.remove('drag-before', 'drag-after'));
    target?.row.classList.add(target.after ? 'drag-after' : 'drag-before');
  };
  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = touchDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    touchDrag.current = null;
    const target = drag.moved ? reorderTarget(document.elementFromPoint(event.clientX, event.clientY), event.clientY, drag.groupId, drag.taskId) : null;
    document.querySelectorAll('.group-task-row.drag-before, .group-task-row.drag-after').forEach(row => row.classList.remove('drag-before', 'drag-after'));
    if (target) onReorder(drag.groupId, drag.taskId, target.beforeId);
  };
  const groupTaskRow = (task: Task, groupId: string, index: number, groupTasks: Task[], reorderable: boolean) =>
    <div key={task.id} className="group-task-row" data-reorder-task={reorderable ? task.id : undefined}
      onDragOver={reorderable ? event => dragOver(event, groupId) : undefined}
      onDrop={reorderable ? event => drop(event, groupId) : undefined}>
      {reorderable && <Button variant="ghost" size="icon-sm" className="drag-handle" draggable title="ドラッグ、または上下矢印キーで並べ替え"
        aria-label={`${task.title}の順番を変更`}
        onDragStart={event => { dragging.current = {groupId, taskId: task.id}; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); }}
        onDragEnd={() => { dragging.current = null; }}
        onPointerDown={event => { if (event.pointerType === 'mouse') return; touchDrag.current = {pointerId: event.pointerId, groupId, taskId: task.id, x: event.clientX, y: event.clientY, moved: false}; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { touchDrag.current = null; }}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          if (event.key === 'ArrowUp' && index > 0) onReorder(groupId, task.id, groupTasks[index - 1].id);
          if (event.key === 'ArrowDown' && index < groupTasks.length - 1) onReorder(groupId, task.id, groupTasks[index + 2]?.id || '');
        }}><GripVertical /></Button>}
      <Button variant="ghost" className="group-task-title" onClick={() => onOpenTask(task.id)}>{task.title}</Button>
      <StatusBadge status={task.status} />
      {task.due_date && <span className="muted group-task-date">期限: {task.due_date}</span>}
    </div>;

  return <>
    <h2>タスク管理</h2>
    <nav className="subnav" aria-label="タスク管理">
      {sections.map(section => <Button key={section} variant={view === section ? 'default' : 'outline'} onClick={() => onView(section)}>{listLabels[entityOf(section)]}</Button>)}
    </nav>
    <div className="toolbar"><div><div className="task-list-heading"><h3>{listLabels[name]}</h3>
      <Button size="icon-sm" aria-label={`${labels[name]}を追加`} title={`${labels[name]}を追加`} onClick={() => onEdit(name)}><Plus /></Button>
    </div><p className="muted">{listDescriptions[name]}</p></div></div>
    {name === 'Tasks' && <>
      <div className="task-filters">
        <label>カテゴリ<NativeSelect value={selectedCategory} onChange={event => setCategoryId(event.target.value)}><NativeSelectOption value="">すべてのカテゴリ</NativeSelectOption>{data.Categories.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}<NativeSelectOption value={unsetFilter}>未設定</NativeSelectOption></NativeSelect></label>
        <label>ラウンド<NativeSelect value={selectedRound} onChange={event => setRoundId(event.target.value)}><NativeSelectOption value="">すべてのラウンド</NativeSelectOption>{data.Rounds.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}<NativeSelectOption value={unsetFilter}>未設定</NativeSelectOption></NativeSelect></label>
        <StatusFilter value={status} onChange={setStatus} />
        <span className="muted task-filter-count">{filteredTasks.length}件 / 全{data.Tasks.length}件</span>
      </div>
      {filteredTasks.length ? <Card className="task-list">{filteredTasks.map(task => <TaskRow key={task.id} task={task} data={data} onOpenTask={onOpenTask} onEdit={onEdit} onDeleteTask={onDeleteTask} />)}</Card>
        : <div className="empty">{data.Tasks.length ? '条件に合うタスクはありません。' : 'タスクはありません。'}</div>}
    </>}
    {name !== 'Tasks' && <>
      {name === 'Categories' && <div className="task-filters"><StatusFilter label="タスクのステータス" value={status} onChange={setStatus} /><span className="muted task-filter-count">{items.length}件 / 全{data.Categories.length}件</span></div>}
      {items.length ? <Card className="entity-list">{items.map(item => {
        const grouped = name === 'Categories' || name === 'Rounds';
        const groupTasks = grouped ? data.Tasks.filter(task => (name === 'Categories' ? task.categoryIds : task.roundIds).includes(item.id) && (name !== 'Categories' || !status || task.status === status)) : [];
        const key = `${name}:${item.id}`;
        const isExpanded = expanded.has(key);
        const itemStatus = 'status' in item ? String(item.status) : '';
        return <section key={item.id} className="group-section">
          <div className="row">
            {grouped ? <Button variant="ghost" className="group-toggle row-main" aria-expanded={isExpanded} aria-controls={`group-tasks-${key}`} onClick={() => toggle(key)}>
              <ChevronDown className={`group-chevron ${isExpanded ? 'expanded' : ''}`} />
              <span className="group-toggle-content"><span className="category-title">
                {name === 'Categories' && <span aria-hidden="true">📁</span>}<strong>{item.name}</strong><span className="category-count">{groupTasks.length}件</span>
                {name === 'Rounds' && <span className="muted">{roundStatus[itemStatus] || itemStatus}</span>}
              </span>{'description' in item && item.description && <span className="muted">{item.description}</span>}</span>
            </Button> : <div className="row-main"><strong>{item.name}</strong></div>}
            <div className="row-actions">
              <Button variant="outline" size={name === 'Categories' ? 'icon-sm' : 'default'} aria-label={`${item.name}を編集`} onClick={() => onEdit(name, item.id)}>{name === 'Categories' ? <Pencil /> : '編集'}</Button>
              {name === 'Categories' && <Button variant="outline" size="icon-sm" aria-label={`${item.name}にタスクを追加`} onClick={() => onEdit('Tasks', undefined, {categoryIds: [item.id]})}><Plus /></Button>}
              {name === 'Rounds' && itemStatus === 'Planned' && data.Rounds.some(round => round.status === 'Active') && <Button variant="outline" onClick={() => onSwitchRound(item.id)}>切り替える</Button>}
              {name === 'Rounds' && itemStatus !== 'Closed' && <Button variant="outline" onClick={() => onCloseRound(item.id)}>終了</Button>}
            </div>
          </div>
          {grouped && isExpanded && <div id={`group-tasks-${key}`} className="group-task-list" data-reorder-group={name === 'Categories' ? 'Categories' : undefined} data-group-id={item.id}>
            {groupTasks.length ? name === 'Categories'
              ? groupTasks.map((task, index) => groupTaskRow(task, item.id, index, groupTasks, true))
              : tasksByCategory(groupTasks, data.Categories).map(group => <section key={group.id || 'uncategorized'} className="round-category"><h4>📁 {group.name}</h4>{group.tasks.map((task, index) => groupTaskRow(task, item.id, index, group.tasks, false))}</section>)
              : <div className="group-task-empty">タスクはありません。</div>}
          </div>}
        </section>;
      })}</Card> : <div className="empty">{name === 'Categories' && data.Categories.length ? '条件に合うカテゴリはありません。' : 'まだありません。'}</div>}
    </>}
  </>;
}
