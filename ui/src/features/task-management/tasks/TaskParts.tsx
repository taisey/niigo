import type {DataSnapshot, Task} from '../../../../api-generated/index.js';
import {Badge} from '@/components/badge';
import {taskStatus} from '@/lib/model';

export function StatusBadge({status}: {status: string}) {
  const tone = status === 'Done' ? 'done' : status === 'In Progress' ? 'progress' : 'todo';
  return <Badge className={`status-badge status-${tone}`}>ステータス: {taskStatus[status] || status || '未設定'}</Badge>;
}

export function CategoryBadges({task, data}: {task: Task; data: DataSnapshot}) {
  const categories = data.Categories.filter(category => task.categoryIds.includes(category.id));
  if (!categories.length) return null;
  return <div className="task-categories"><span className="muted">カテゴリ:</span>{categories.map(category =>
    <Badge key={category.id} variant="secondary" className="category-badge">📁 {category.name}</Badge>
  )}</div>;
}
