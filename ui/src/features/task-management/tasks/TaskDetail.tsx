import {useState} from 'react';
import type {DataSnapshot, Task} from '../../../../api-generated/index.js';
import {Pencil} from 'lucide-react';
import {Button} from '@/components/button';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/dialog';
import {NativeSelect, NativeSelectOption} from '@/components/native-select';
import {taskStatus} from '@/lib/model';
import {StatusBadge} from './TaskParts';

function LinkedText({value}: {value: string}) {
  const parts = value.split(/(https?:\/\/[^\s<>"']+)/g);
  return <>{parts.map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return part;
    const suffix = part.match(/[.,!?;:，。！？、）】」』]+$/)?.[0] || '';
    const url = suffix ? part.slice(0, -suffix.length) : part;
    return <span key={index}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a>{suffix}</span>;
  })}</>;
}

type Props = {
  task: Task | null;
  data: DataSnapshot;
  onClose: () => void;
  onEdit: (id: string) => void;
  onStatusSave: (task: Task, status: string) => Promise<boolean>;
};

export default function TaskDetail({task, data, onClose, onEdit, onStatusSave}: Props) {
  const [status, setStatus] = useState(task?.status || 'Todo');
  if (!task) return null;
  const categories = data.Categories.filter(item => task.categoryIds.includes(item.id)).map(item => item.name);
  const rounds = data.Rounds.filter(item => task.roundIds.includes(item.id)).map(item => item.name);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="detail-dialog" showCloseButton={false}>
      <DialogHeader className="task-detail-header"><DialogTitle>{task.title}</DialogTitle>
        <Button size="icon-sm" variant="outline" aria-label={`${task.title}を編集`} title="編集" onClick={() => onEdit(task.id)}><Pencil /></Button>
      </DialogHeader>
      <DialogDescription className="sr-only">タスクの詳細</DialogDescription>
      <dl className="task-detail-list">
        <dt>ステータス</dt><dd><StatusBadge status={task.status} /></dd>
        <dt>👤 担当者</dt><dd>{task.assignees || '未設定'}</dd>
        <dt>カテゴリ</dt><dd>{categories.join('、') || '未設定'}</dd>
        <dt>🔄 ラウンド</dt><dd>{rounds.join('、') || '未設定'}</dd>
        <dt>期限</dt><dd>{task.due_date || '未設定'}</dd>
        <dt>詳細</dt><dd className="task-detail-description"><LinkedText value={task.description || '詳細はありません。'} /></dd>
      </dl>
      <div className="mobile-status-editor"><label>ステータス<NativeSelect value={status} onChange={event => setStatus(event.target.value)}>
        {Object.entries(taskStatus).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
      </NativeSelect></label><Button onClick={() => void onStatusSave(task, status)}>ステータスを保存</Button></div>
      <DialogFooter className="dialog-actions"><Button variant="outline" onClick={onClose}>閉じる</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
