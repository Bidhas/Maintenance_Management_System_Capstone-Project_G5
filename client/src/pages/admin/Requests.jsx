import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import useAsync from '../../hooks/useAsync';
import useDebounced from '../../hooks/useDebounced';
import usePolling from '../../hooks/usePolling';
import { STATUSES } from '../../lib/ui';
import EmptyState from '../../components/EmptyState';
import RequestList from '../../components/RequestList';
import RequestPanel from '../../components/RequestPanel';
import Modal from '../../components/Modal';
import Spinner from '../../components/Spinner';
import ErrorBox from '../../components/ErrorBox';

export default function Requests() {
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(null);
  const q = params.get('q') || '';
  const status = params.get('status') || '';
  const urgency = params.get('urgency') || '';
  const category_id = params.get('category_id') || '';
  const block = params.get('block') || '';
  const dq = useDebounced(q, 200);
  const setParam = (k, v) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });

  const lists = useAsync(async () => {
    const [c, b] = await Promise.all([api.get('/categories', { params: { all: 1 } }), api.get('/blocks')]);
    return { categories: c.data.categories, blocks: b.data.blocks };
  }, []);

  const { data, error, loading, reload } = useAsync(async () => {
    const query = {};
    if (dq) query.q = dq; if (status) query.status = status; if (urgency) query.urgency = urgency;
    if (category_id) query.category_id = category_id; if (block) query.block = block;
    return (await api.get('/requests', { params: query })).data.requests;
  }, [dq, status, urgency, category_id, block]);
  usePolling(reload, 30000);

  return (
    <>
      <h1>Requests</h1>
      <p className="mu">All maintenance work orders. Click a row to review, assign or decline.</p>
      <div className="g">
        <div className="filters">
          <input value={q} onChange={(e) => setParam('q', e.target.value)} placeholder="Search ID, room, block" aria-label="Search" />
          <select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
            <option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={urgency} onChange={(e) => setParam('urgency', e.target.value)} aria-label="Urgency">
            <option value="">All urgency</option><option value="High">Urgent</option><option value="Medium">Medium</option><option value="Low">Low</option>
          </select>
          <select value={category_id} onChange={(e) => setParam('category_id', e.target.value)} aria-label="Category">
            <option value="">All categories</option>{(lists.data?.categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={block} onChange={(e) => setParam('block', e.target.value)} aria-label="Block">
            <option value="">All blocks</option>{(lists.data?.blocks || []).map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
        </div>
      </div>
      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox message={error} onRetry={reload} /> : data.length === 0 ? (
        <EmptyState title="No requests match" subtitle="Try adjusting your filters." />
      ) : (
        <RequestList rows={data} show={['code', 'location', 'category', 'urgency', 'status', 'tech', 'created']} onOpen={(r) => setOpenId(r.id)} />
      )}
      <Modal open={!!openId} onClose={() => setOpenId(null)} wide>
        {openId && <RequestPanel id={openId} onChanged={reload} />}
      </Modal>
    </>
  );
}
