import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import './index.css';

const api = axios.create({ baseURL: 'http://localhost:3001' });

function App() {
  const [logs, setLogs] = useState([]);
  const [idempotencyKey, setIdempotencyKey] = useState(uuidv4());
  const [cardNumber, setCardNumber] = useState('');
  const [card, setCard] = useState(null);
  const [etag, setEtag] = useState(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const addLog = (msg, type = 'info') => {
    setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev]);
  };

  const handleCreateCard = async () => {
    if (!cardNumber) {
      addLog('Ingrese un número de tarjeta.', 'error');
      return;
    }
    setLoading(true);
    addLog(`Enviando POST /cards con Idempotency-Key: ${idempotencyKey}`, 'info');
    
    try {
      const response = await api.post('/cards', 
        { card_number: cardNumber },
        { headers: { 'x-idempotency-key': idempotencyKey } }
      );
      
      addLog(`Éxito: ${response.data.message}`, 'success');
      setCard(response.data.card);
      // Fetch the card again to get the ETag
      fetchCardDetails(response.data.card.id);
    } catch (error) {
      if (error.response) {
        addLog(`Error ${error.response.status}: ${error.response.data.error}`, 'error');
      } else {
        addLog(`Error de red: ${error.message}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchCardDetails = async (id) => {
    try {
      const response = await api.get(`/cards/${id}`);
      setEtag(response.headers['etag']);
      addLog(`GET /cards/${id} - ETag actual: ${response.headers['etag']}`, 'info');
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdateBalance = async () => {
    if (!card || !amount) return;
    setLoading(true);
    addLog(`Enviando PUT /cards/${card.id}/balance con If-Match: ${etag}`, 'info');

    try {
      const response = await api.put(`/cards/${card.id}/balance`, 
        { amount: parseFloat(amount) },
        { headers: { 'If-Match': etag } }
      );
      
      addLog(`Éxito: Balance actualizado. Nuevo ETag: ${response.headers['etag']}`, 'success');
      setCard(response.data.card);
      setEtag(response.headers['etag']);
    } catch (error) {
      if (error.response) {
        if (error.response.status === 412) {
          addLog(`Error 412 Precondition Failed. El recurso fue modificado concurrente.`, 'error');
          // Fetch new state to allow retry
          fetchCardDetails(card.id);
        } else {
          addLog(`Error ${error.response.status}: ${error.response.data.error}`, 'error');
        }
      } else {
        addLog(`Error de red: ${error.message}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const generateNewKey = () => {
    const key = uuidv4();
    setIdempotencyKey(key);
    addLog(`Generada nueva clave de idempotencia: ${key}`, 'info');
  };

  return (
    <div className="container">
      <header className="header">
        <h1>Sistema de Evaluación Síncrono</h1>
        <p>Demostración de Idempotencia y Control de Concurrencia</p>
      </header>

      <main className="main-content">
        <div className="card-section">
          <div className="panel idempotency-panel">
            <h2>1. Crear Tarjeta (POST Idempotente)</h2>
            <div className="form-group">
              <label>Idempotency-Key:</label>
              <div className="input-group">
                <input type="text" readOnly value={idempotencyKey} />
                <button onClick={generateNewKey} className="btn btn-secondary">Regenerar</button>
              </div>
            </div>
            <div className="form-group">
              <label>Número de Tarjeta:</label>
              <input 
                type="text" 
                value={cardNumber} 
                onChange={e => setCardNumber(e.target.value)} 
                placeholder="Ej. 4111222233334444"
              />
            </div>
            <button 
              onClick={handleCreateCard} 
              disabled={loading}
              className="btn btn-primary"
            >
              Crear Tarjeta / Reintentar
            </button>
            <p className="help-text">
              Haga clic varias veces para simular reintentos con la misma clave de idempotencia. 
              El servidor puede devolver 503 aleatoriamente; los reintentos (Backoff) ayudarán.
            </p>
          </div>

          {card && (
            <div className="panel concurrency-panel">
              <h2>2. Actualizar Balance (Bloqueo Optimista)</h2>
              <div className="card-info">
                <p><strong>Tarjeta ID:</strong> {card.id}</p>
                <p><strong>Balance:</strong> ${Number(card.balance).toFixed(2)}</p>
                <p><strong>ETag (Versión):</strong> {etag}</p>
              </div>
              <div className="form-group">
                <label>Monto a recargar:</label>
                <input 
                  type="number" 
                  value={amount} 
                  onChange={e => setAmount(e.target.value)} 
                  placeholder="Ej. 100"
                />
              </div>
              <button 
                onClick={handleUpdateBalance} 
                disabled={loading}
                className="btn btn-success"
              >
                Actualizar Balance
              </button>
              <p className="help-text">
                Enviaremos el ETag en la cabecera If-Match. Si hay un conflicto, el servidor devolverá 412.
              </p>
            </div>
          )}
        </div>

        <div className="logs-section">
          <h2>Registro de Operaciones (Logs)</h2>
          <div className="logs-container">
            {logs.map((log, index) => (
              <div key={index} className={`log-entry ${log.type}`}>
                <span className="log-time">[{log.time}]</span> {log.msg}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
