import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ClipLoader } from "react-spinners";
import { motion } from "framer-motion";
import '../styles/Admin.css';

function Admin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingUser, setUpdatingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/users`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (response.status === 401) {
          if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
            window.location.href = '/login?expired=true';
          }
          return;
        }

        if (!response.ok) {
          navigate("/", { state: { errorModal: "권한이 없습니다." } });
          return;
        }

        const data = await response.json();
        setUsers(data);
        setLoading(false);
      } catch (err) {
        navigate("/", { state: { errorModal: "오류가 발생했습니다." } });
      }
    };

    fetchUsers();
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const userId = params.get('userId');
    
    if (userId) {
      const user = users.find(u => u.user_id === userId);
      if (user) {
        setSelectedUser(user);
        fetchUserConversations(userId);
      }
    } else {
      setSelectedUser(null);
      setConversations([]);
    }
  }, [location.search, users]);

  const fetchUserConversations = async (userId) => {
    try {
      setLoadingConversations(true);
      const response = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/conversations/${userId}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.status === 401) {
        if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
          window.location.href = '/login?expired=true';
        }
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '대화 내역을 불러오는데 실패했습니다.');
      }

      const data = await response.json();
      setConversations(data.conversations);
    } catch (err) {
      console.error('대화 내역 로딩 오류:', err);
    } finally {
      setLoadingConversations(false);
    }
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    try {
      setUpdatingUser(userId);
      const response = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/users/${userId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trial: !currentStatus
        }),
      });
      
      if (response.status === 401) {
        if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
          window.location.href = '/login?expired=true';
        }
        return;
      }

      if (!response.ok) {
        throw new Error('상태 변경에 실패했습니다.');
      }

      const updatedUser = await response.json();
      
      setUsers(users.map(user => 
        user.user_id === userId ? updatedUser : user
      ));
    } catch (err) {
      alert('사용자 상태 변경 중 오류가 발생했습니다.');
      console.error(err);
    } finally {
      setUpdatingUser(null);
    }
  };

  const handleUserClick = (user) => {
    navigate(`/admin?userId=${user.user_id}`);
  };

  const handleBackToUsers = () => {
    setSelectedUser(null);
    setConversations([]);
    navigate('/admin');
  };

  const viewConversationDetails = (conversationId, type) => {
    window.open(`/view/${type}/${conversationId}`, '_blank');
  };

  const StatusToggle = ({ user }) => {
    const isUpdating = updatingUser === user.user_id;
    const isPremium = !user.trial;
    
    return (
      <div className="status-container">
        <label className={`toggle-switch ${isUpdating ? 'disabled' : ''}`}>
          <input 
            type="checkbox" 
            checked={isPremium}
            onChange={() => toggleUserStatus(user.user_id, user.trial)}
            disabled={isUpdating}
          />
          <span className="toggle-slider" />
        </label>
      </div>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) {
      return '-';
    }

    const date = new Date(dateString);

    date.setHours(date.getHours() + 9);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  if (loading) {
    return (
      <motion.div
        className="admin-loading-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <ClipLoader loading={true} size={50} />
      </motion.div>
    );
  }

  if (selectedUser) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <button className="back-button" onClick={handleBackToUsers}>← 돌아가기</button>
          <h1 className="admin-title">{selectedUser.name}님의 대화 내역</h1>
        </div>
        
        <div className="user-info-card">
          <div className="user-info-item">
            <span className="label">이메일</span>
            <span className="value">{selectedUser.email}</span>
          </div>
          <div className="user-info-item">
            <span className="label">사용량</span>
            <span className="value">${selectedUser.billing.toFixed(2)}</span>
          </div>
          <div className="user-info-item">
            <span className="label">상태</span>
            <span className="value">{selectedUser.trial ? '임시회원' : '정회원'}</span>
          </div>
        </div>
        
        {loadingConversations ? (
          <motion.div
            className="admin-loading-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <ClipLoader loading={true} size={50} />
          </motion.div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>대화 제목</th>
                  <th>모델</th>
                  <th>생성일</th>
                </tr>
              </thead>
              <tbody>
                {conversations.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="no-data">대화 내역이 없습니다.</td>
                  </tr>
                ) : (
                  conversations.map(conv => (
                    <tr key={conv.conversation_id}>
                      <td>
                        <button 
                          className="user-name-link"
                          onClick={() => viewConversationDetails(conv.conversation_id, conv.type)}
                        >
                          {conv.alias}
                        </button>
                      </td>
                      <td>{conv.model || '-'}</td>
                      <td>{formatDate(conv.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="admin-container">
      <h1 className="admin-title">사용자 관리</h1>
      <div className="admin-stats">
        <div className="stat-card">
          <h3>전체 사용자</h3>
          <p>{users.length}</p>
        </div>
        <div className="stat-card">
          <h3>임시회원</h3>
          <p>{users.filter(user => user.trial).length}</p>
        </div>
        <div className="stat-card">
          <h3>정회원</h3>
          <p>{users.filter(user => !user.trial).length}</p>
        </div>
      </div>
      
      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>사용량</th>
              <th>정회원</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="4" className="no-data">사용자 데이터가 없습니다.</td>
              </tr>
            ) : (
              users.map(user => (
                <tr key={user.user_id}>
                  <td>
                    <button 
                      className="user-name-link"
                      onClick={() => handleUserClick(user)}
                    >
                      {user.name}
                    </button>
                  </td>
                  <td>{user.email}</td>
                  <td>${user.billing.toFixed(2)}</td>
                  <td>
                    <StatusToggle user={user} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Admin;