import { useNavigate, useParams } from 'react-router-dom';
import RequestPanel from '../components/RequestPanel';

/** Full-page version of the request panel (opened from notifications and links). */
export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <div className="narrow wide-form" style={{ marginTop: 8 }}>
      <button type="button" className="btn s xs" onClick={() => navigate(-1)}>Back</button>
      <div className="g mt"><RequestPanel id={id} /></div>
    </div>
  );
}
