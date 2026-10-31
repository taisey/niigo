import {useEffect, useState, type FormEvent} from 'react';
import type {DataSnapshot} from '../../../../api-generated/index.js';
import {Button} from '@/components/button';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/dialog';
import {Input} from '@/components/input';
import {Textarea} from '@/components/textarea';
import {NativeSelect, NativeSelectOption} from '@/components/native-select';
import {labels, roundStatus, taskStatus, type EditableItem, type EntityName} from '@/lib/model';

export type Editing = {name: EntityName; item: EditableItem | null; defaults: EditableItem} | null;

type Props = {
  editing: Editing;
  data: DataSnapshot;
  onClose: () => void;
  onSave: (name: EntityName, item: EditableItem, old: EditableItem | null) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
};

export default function TaskEditor({editing, data, onClose, onSave, onDelete}: Props) {
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const source = editing?.item || editing?.defaults;
    setAssigneeIds(Array.isArray(source?.assigneesIds) ? source.assigneesIds as string[] : []);
    setSearch('');
  }, [editing]);
  if (!editing) return null;
  const {name, item: old, defaults} = editing;
  const item = old || defaults;
  const text = (field: string) => String(item[field] || '');
  const chosen = (field: string) => Array.isArray(item[field]) ? item[field] as string[] : [];
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const fields = name === 'Tasks' ? ['title', 'description', 'due_date', 'status']
      : name === 'Rounds' ? ['name', 'description', 'start_date', 'end_date', 'status']
      : name === 'Categories' ? ['name', 'description'] : ['name'];
    const next: EditableItem = {id: old?.id || ''};
    for (const field of fields) next[field] = String(form.get(field) || '');
    if (name === 'Tasks') {
      next.assigneesIds = assigneeIds;
      next.categoryIds = form.getAll('categoryIds').map(String).filter(Boolean);
      next.roundIds = form.getAll('roundIds').map(String).filter(Boolean);
    }
    try {
      if (await onSave(name, next, old)) onClose();
    } finally { setSaving(false); }
  };
  const field = (label: string, fieldName: string, type = 'text') =>
    <label key={fieldName}>{label}<Input name={fieldName} type={type} defaultValue={text(fieldName)} /></label>;
  const multi = (label: string, fieldName: string, choices: Array<{id: string; name: string}>) =>
    <label>{label}<NativeSelect className="multi-select" name={fieldName} multiple defaultValue={chosen(fieldName)}>
      {choices.map(choice => <NativeSelectOption key={choice.id} value={choice.id}>{choice.name}</NativeSelectOption>)}
    </NativeSelect></label>;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="editor-dialog" showCloseButton={false}>
      <form key={`${name}:${old?.id || 'new'}`} onSubmit={submit}>
        <DialogHeader><DialogTitle>{old ? '編集: ' : '追加: '}{labels[name]}</DialogTitle><DialogDescription className="sr-only">{labels[name]}の入力欄</DialogDescription></DialogHeader>
        <div className="dialog-fields">
          {name === 'Tasks' ? <>
            {field('タスク名', 'title')}
            <label>詳細<Textarea name="description" defaultValue={text('description')} /></label>
            {field('期限', 'due_date', 'date')}
            <label>ステータス<NativeSelect name="status" defaultValue={text('status') || 'Todo'}>{Object.entries(taskStatus).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></label>
            <fieldset className="assignee-picker"><legend>担当者</legend>
              <div className="assignee-chips">{assigneeIds.length ? assigneeIds.map(id => {
                const member = data.Members.find(value => value.id === id);
                return member && <span className="assignee-chip" key={id}>{member.name}<Button variant="ghost" size="icon-xs" type="button" aria-label={`${member.name}を担当から外す`} onClick={() => setAssigneeIds(ids => ids.filter(value => value !== id))}>×</Button></span>;
              }) : <span className="muted">担当者未設定</span>}</div>
              {data.Members.length ? <>
                <label>メンバーを検索して追加<Input type="search" autoComplete="off" placeholder="名前を入力" value={search} onChange={event => setSearch(event.target.value)} /></label>
                {search.trim() && <div className="assignee-matches">{data.Members.filter(member => !assigneeIds.includes(member.id) && member.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
                  .map(member => <Button key={member.id} type="button" variant="outline" size="sm" onClick={() => { setAssigneeIds(ids => [...ids, member.id]); setSearch(''); }}>{member.name}</Button>)}</div>}
              </> : <span className="muted">メンバー管理からメンバーを追加してください。</span>}
            </fieldset>
            {multi('カテゴリ', 'categoryIds', data.Categories)}
            {multi('ラウンド', 'roundIds', data.Rounds.filter(round => round.status !== 'Closed' || chosen('roundIds').includes(round.id)))}
          </> : <>
            {field('名前', 'name')}
            {name !== 'Members' && <label>説明<Textarea name="description" defaultValue={text('description')} /></label>}
            {name === 'Rounds' && <>
              {field('開始日', 'start_date', 'date')}{field('終了日', 'end_date', 'date')}
              <label>ステータス<NativeSelect name="status" defaultValue={text('status') || 'Planned'}>
                {Object.entries(roundStatus).filter(([value]) => value !== 'Closed' || item.status === 'Closed').map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
              </NativeSelect></label>
            </>}
          </>}
        </div>
        <DialogFooter className="dialog-actions">
          {name === 'Tasks' && old && <Button type="button" variant="destructive" className="delete-action" onClick={async () => { if (await onDelete(String(old.id))) onClose(); }}>削除</Button>}
          <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
