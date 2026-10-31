import {useState} from 'react';
import type {DataSnapshot, Round} from '../../../../api-generated/index.js';
import {Button} from '@/components/button';
import {Checkbox} from '@/components/checkbox';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/dialog';
import {NativeSelect, NativeSelectOption} from '@/components/native-select';

type Props = {
  data: DataSnapshot;
  closing: Round;
  switchingTo: Round | null;
  onClose: () => void;
  onSubmit: (destinations: Record<string, string>) => Promise<boolean>;
};

export default function RoundCloseDialog({data, closing, switchingTo, onClose, onSubmit}: Props) {
  const tasks = data.Tasks.filter(task => task.roundIds.includes(closing.id) && task.status !== 'Done');
  const [destinations, setDestinations] = useState<Record<string, string>>(() =>
    Object.fromEntries(tasks.map(task => [task.id, switchingTo?.id || ''])));
  const [saving, setSaving] = useState(false);
  const choices = data.Rounds.filter(round => round.id !== closing.id && round.status !== 'Closed');
  const title = switchingTo ? 'ラウンドを切り替える' : 'ラウンドを終了';
  const description = switchingTo
    ? `「${closing.name}」を終了し、「${switchingTo.name}」を進行中にします。引き継がない未完了タスクはラウンド未設定になり、完了したタスクは元のラウンドに残ります。`
    : '未完了のタスクごとに移動先を選んでください。完了したタスクはこのラウンドに残ります。';
  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try { if (await onSubmit(destinations)) onClose(); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="editor-dialog" showCloseButton={false}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <div className="dialog-fields">
        {tasks.length ? tasks.map(task => switchingTo
          ? <label className="switch-task" key={task.id}><Checkbox checked={destinations[task.id] === switchingTo.id}
              onCheckedChange={checked => setDestinations(current => ({...current, [task.id]: checked ? switchingTo.id : ''}))} />{task.title}</label>
          : <label key={task.id}>{task.title}<NativeSelect value={destinations[task.id] || ''}
              onChange={event => setDestinations(current => ({...current, [task.id]: event.target.value}))}>
              <NativeSelectOption value="">タスク一覧（ラウンドなし）</NativeSelectOption>
              {choices.map(round => <NativeSelectOption key={round.id} value={round.id}>{round.name}</NativeSelectOption>)}
            </NativeSelect></label>)
          : <p>移動するタスクはありません。</p>}
      </div>
      <DialogFooter className="dialog-actions"><Button variant="outline" onClick={onClose}>キャンセル</Button><Button disabled={saving} onClick={submit}>{saving ? '処理中…' : switchingTo ? '切り替える' : '終了する'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
