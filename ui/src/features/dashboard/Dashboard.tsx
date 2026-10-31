import {useState, type DragEvent, type KeyboardEvent} from 'react';
import type {DataSnapshot, Task} from '../../../api-generated/index.js';
import {Button} from '@/components/button';
import {Card} from '@/components/card';
import {NativeSelect, NativeSelectOption} from '@/components/native-select';
import {taskStatus, tasksByCategory, unsetFilter, validLinkedIds} from '@/lib/model';

type Props = {
  data: DataSnapshot;
  onOpenTask: (id: string) => void;
  onStatusChange: (task: Task, status: string) => void;
};

function TaskCard({task, onOpenTask}: {task: Task; onOpenTask: (id: string) => void}) {
  const open = () => onOpenTask(task.id);
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
  };
  return <Card className="kanban-task-row" role="button" tabIndex={0} draggable
    onClick={open} onKeyDown={keyDown}
    onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); }}
  >
    <strong>{task.title}</strong>
    {task.due_date && <span className="muted">期限: {task.due_date}</span>}
    {task.assignees && <span className="muted">👤 {task.assignees}</span>}
  </Card>;
}

function GroupedCards({tasks, data, onOpenTask}: {tasks: Task[]; data: DataSnapshot; onOpenTask: (id: string) => void}) {
  if (!tasks.length) return <div className="empty">タスクはありません。</div>;
  return <>{tasksByCategory(tasks, data.Categories).map(group =>
    <section className="kanban-category" key={group.id || 'uncategorized'}>
      <h4>📁 {group.name}</h4>
      <div className="kanban-cards">{group.tasks.map(task => <TaskCard key={task.id} task={task} onOpenTask={onOpenTask} />)}</div>
    </section>
  )}</>;
}

export default function Dashboard({data, onOpenTask, onStatusChange}: Props) {
  const [assigneeId, setAssigneeId] = useState('');
  const [mobileStatus, setMobileStatus] = useState('Todo');
  const [dragOver, setDragOver] = useState('');
  const active = data.Rounds.filter(round => round.status === 'Active');
  const activeTasks = data.Tasks.filter(task => active.some(round => task.roundIds.includes(round.id)));
  const selectedAssignee = assigneeId === unsetFilter || data.Members.some(member => member.id === assigneeId) ? assigneeId : '';
  const tasks = activeTasks.filter(task => !selectedAssignee || (selectedAssignee === unsetFilter
    ? !validLinkedIds(task.assigneesIds, data.Members)
    : task.assigneesIds.includes(selectedAssignee)));
  const heading = active.length ? '🔄 ラウンド: ' + active.map(round => round.name).join('、') : '進行中のラウンドはありません';
  const statuses = Object.entries(taskStatus);

  const drop = (event: DragEvent<HTMLElement>, status: string) => {
    event.preventDefault();
    setDragOver('');
    const task = data.Tasks.find(item => item.id === event.dataTransfer.getData('text/plain'));
    if (task && task.status !== status) onStatusChange(task, status);
  };

  return <>
    <div className="toolbar"><div><h2>ダッシュボード</h2><p className="muted">{heading}</p><p className="muted dashboard-desktop-hint">タスクをドラッグしてステータスを変更できます。</p></div></div>
    <div className="task-filters">
      <label>担当者
        <NativeSelect value={selectedAssignee} onChange={event => setAssigneeId(event.target.value)}>
          <NativeSelectOption value="">すべての担当者</NativeSelectOption>
          {data.Members.map(member => <NativeSelectOption key={member.id} value={member.id}>{member.name}</NativeSelectOption>)}
          <NativeSelectOption value={unsetFilter}>未設定</NativeSelectOption>
        </NativeSelect>
      </label>
      {active.length > 0 && <span className="muted task-filter-count">{tasks.length}件 / 全{activeTasks.length}件</span>}
    </div>
    {active.length ? <>
      <div className="mobile-status-tabs">{statuses.map(([status, label]) =>
        <Button key={status} variant={mobileStatus === status ? 'default' : 'outline'} onClick={() => setMobileStatus(status)}>{label}</Button>
      )}</div>
      <section className="mobile-dashboard-column"><h3>{taskStatus[mobileStatus]}<span className="count">{tasks.filter(task => task.status === mobileStatus).length}</span></h3>
        <GroupedCards tasks={tasks.filter(task => task.status === mobileStatus)} data={data} onOpenTask={onOpenTask} />
      </section>
      <div className="kanban">{statuses.map(([status, label]) => {
        const statusTasks = tasks.filter(task => task.status === status);
        return <section key={status} className={`kanban-column ${dragOver === status ? 'drag-over' : ''}`}
          onDragOver={event => { event.preventDefault(); setDragOver(status); }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(''); }}
          onDrop={event => drop(event, status)}>
          <h3>{label}<span className="count">{statusTasks.length}</span></h3>
          <GroupedCards tasks={statusTasks} data={data} onOpenTask={onOpenTask} />
        </section>;
      })}</div>
    </> : <div className="empty">ラウンド管理から進行中のラウンドを設定してください。</div>}
  </>;
}
