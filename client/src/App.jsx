import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  LogOut,
  Menu,
  MessageCircle,
  MoreVertical,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  Smile,
  User,
  UserCircle,
  Video,
  X,
} from "lucide-react";
import "./App.css";

const API =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

// --------------------------------------------------
// Helpers
// --------------------------------------------------

const getUserId = (user) => {
  if (!user) return "";

  return (
    user._id ||
    user.id ||
    user.userId ||
    ""
  ).toString();
};

const getConversationId = (conversation) => {
  if (!conversation) return "";

  return (
    conversation._id ||
    conversation.id ||
    ""
  ).toString();
};

const getMessageConversationId = (message) => {
  if (!message) return "";

  if (typeof message.conversation === "string") {
    return message.conversation;
  }

  if (message.conversation?._id) {
    return message.conversation._id.toString();
  }

  if (message.conversation?.id) {
    return message.conversation.id.toString();
  }

  if (message.conversationId) {
    return message.conversationId.toString();
  }

  return "";
};

const formatTime = (dateValue) => {
  if (!dateValue) return "";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatLastSeen = (dateValue) => {
  if (!dateValue) return "Offline";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Offline";
  }

  return `last seen ${date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const getInitials = (name = "") => {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (
    words[0][0] +
    words[words.length - 1][0]
  ).toUpperCase();
};

// Remove duplicate users by MongoDB ID
const dedupeUsers = (userList = []) => {
  const map = new Map();

  userList.forEach((user) => {
    const id = getUserId(user);

    if (!id) return;

    if (!map.has(id)) {
      map.set(id, user);
    }
  });

  return Array.from(map.values());
};

// Get the other participant in a 1-to-1 conversation
const getOtherParticipant = (
  conversation,
  currentUserId
) => {
  if (!conversation?.participants) {
    return null;
  }

  return (
    conversation.participants.find(
      (participant) =>
        getUserId(participant) !== currentUserId
    ) || null
  );
};

// Create a stable key for a 1-to-1 conversation.
// This lets us hide duplicate conversation documents
// without deleting anything from MongoDB.
const getConversationPairKey = (
  conversation,
  currentUserId
) => {
  if (!conversation?.participants) {
    return "";
  }

  const ids = conversation.participants
    .map((participant) =>
      getUserId(participant)
    )
    .filter(Boolean);

  if (ids.length !== 2) {
    return "";
  }

  return ids.sort().join("_");
};

// Keep only one conversation per user pair.
// The newest conversation is preferred.
const dedupeConversations = (
  conversationList = [],
  currentUserId = ""
) => {
  const map = new Map();

  const sorted = [...conversationList].sort(
    (a, b) => {
      const dateA = new Date(
        a.updatedAt || a.createdAt || 0
      ).getTime();

      const dateB = new Date(
        b.updatedAt || b.createdAt || 0
      ).getTime();

      return dateB - dateA;
    }
  );

  sorted.forEach((conversation) => {
    const pairKey =
      getConversationPairKey(
        conversation,
        currentUserId
      );

    if (!pairKey) return;

    if (!map.has(pairKey)) {
      map.set(pairKey, conversation);
    }
  });

  return Array.from(map.values());
};

// --------------------------------------------------
// App
// --------------------------------------------------

function App() {
  // ----------------------------------------------
  // Authentication
  // ----------------------------------------------

  const [token, setToken] = useState(
    localStorage.getItem("chatToken") || ""
  );

  const [currentUser, setCurrentUser] =
    useState(() => {
      try {
        return JSON.parse(
          localStorage.getItem("chatUser") || "null"
        );
      } catch {
        return null;
      }
    });

  const [authMode, setAuthMode] =
    useState("login");

  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [authLoading, setAuthLoading] =
    useState(false);

  const [authError, setAuthError] =
    useState("");

  // ----------------------------------------------
  // Main data
  // ----------------------------------------------

  const [users, setUsers] = useState([]);
  const [conversations, setConversations] =
    useState([]);

  const [selectedUser, setSelectedUser] =
    useState(null);

  const [conversationId, setConversationId] =
    useState("");

  const [messages, setMessages] =
    useState([]);

  // ----------------------------------------------
  // Search
  // ----------------------------------------------

  const [searchQuery, setSearchQuery] =
    useState("");

  const [searchLoading, setSearchLoading] =
    useState(false);

  const [showSearchResults, setShowSearchResults] =
    useState(false);

  // ----------------------------------------------
  // Message
  // ----------------------------------------------

  const [messageText, setMessageText] =
    useState("");

  const [sending, setSending] =
    useState(false);

  const [loadingMessages, setLoadingMessages] =
    useState(false);

  // ----------------------------------------------
  // Typing
  // ----------------------------------------------

  const [isTyping, setIsTyping] =
    useState(false);

  const [otherUserTyping, setOtherUserTyping] =
    useState(false);

  const typingTimeoutRef = useRef(null);

  // ----------------------------------------------
  // UI
  // ----------------------------------------------

  const [mobileSidebarOpen, setMobileSidebarOpen] =
    useState(false);

  const [showProfile, setShowProfile] =
    useState(false);

  const [showMenu, setShowMenu] =
    useState(false);

  const [notificationCount, setNotificationCount] =
    useState(0);

  const [unreadCounts, setUnreadCounts] =
    useState({});

  const [errorMessage, setErrorMessage] =
    useState("");

  // ----------------------------------------------
  // Profile
  // ----------------------------------------------

  const [profileName, setProfileName] =
    useState("");

  const [profileEmail, setProfileEmail] =
    useState("");

  const [profileSaving, setProfileSaving] =
    useState(false);

  const [profilePictureUploading, setProfilePictureUploading] =
    useState(false);

  // ----------------------------------------------
  // Refs
  // ----------------------------------------------

  const socketRef = useRef(null);

  const conversationIdRef =
    useRef("");

  const selectedUserIdRef =
    useRef("");

  const messagesEndRef =
    useRef(null);

  // ----------------------------------------------
  // Current user ID
  // ----------------------------------------------

  const currentUserId = useMemo(
    () => getUserId(currentUser),
    [currentUser]
  );

  // ----------------------------------------------
  // Axios helper
  // ----------------------------------------------

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
  });

  // ----------------------------------------------
  // Save authentication
  // ----------------------------------------------

  const saveAuth = (newToken, user) => {
    localStorage.setItem(
      "chatToken",
      newToken
    );

    localStorage.setItem(
      "chatUser",
      JSON.stringify(user)
    );

    setToken(newToken);
    setCurrentUser(user);
  };

  // ----------------------------------------------
  // Clear error after a while
  // ----------------------------------------------

  useEffect(() => {
    if (!errorMessage) return;

    const timer = setTimeout(() => {
      setErrorMessage("");
    }, 4000);

    return () => clearTimeout(timer);
  }, [errorMessage]);

  // ----------------------------------------------
  // Keep refs synchronized
  // ----------------------------------------------

  useEffect(() => {
    conversationIdRef.current =
      conversationId;
  }, [conversationId]);

  useEffect(() => {
    selectedUserIdRef.current =
      getUserId(selectedUser);
  }, [selectedUser]);

  // ----------------------------------------------
  // Auto-scroll messages
  // ----------------------------------------------

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, otherUserTyping]);

  // ----------------------------------------------
  // Profile initialization
  // ----------------------------------------------

  useEffect(() => {
    if (!currentUser) return;

    setProfileName(
      currentUser.name || ""
    );

    setProfileEmail(
      currentUser.email || ""
    );
  }, [currentUser]);

  // ----------------------------------------------
  // Socket.IO connection
  // ----------------------------------------------

  useEffect(() => {
    if (!token || !currentUserId) {
      return;
    }

    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log(
        "Socket connected:",
        socket.id
      );

      socket.emit(
        "joinUser",
        currentUserId
      );

      if (conversationIdRef.current) {
        socket.emit(
          "joinConversation",
          conversationIdRef.current
        );
      }
    });

    // ------------------------------------------
    // Incoming real-time message
    // ------------------------------------------

    socket.on(
      "receiveMessage",
      (incomingMessage) => {
        const incomingConversationId =
          getMessageConversationId(
            incomingMessage
          );

        if (!incomingConversationId) {
          return;
        }

        // Ignore duplicate socket events
        setMessages((previousMessages) => {
          const alreadyExists =
            previousMessages.some(
              (message) =>
                message._id &&
                incomingMessage._id &&
                message._id.toString() ===
                  incomingMessage._id.toString()
            );

          if (alreadyExists) {
            return previousMessages;
          }

          // Only append to currently open chat
          if (
            incomingConversationId !==
            conversationIdRef.current
          ) {
            return previousMessages;
          }

          return [
            ...previousMessages,
            incomingMessage,
          ];
        });

        // If message belongs to another chat,
        // increase unread count.
        if (
          incomingConversationId !==
          conversationIdRef.current
        ) {
          setNotificationCount(
            (previous) => previous + 1
          );

          setUnreadCounts((previous) => ({
            ...previous,
            [incomingConversationId]:
              (previous[
                incomingConversationId
              ] || 0) + 1,
          }));
        }

        // Update recent conversation preview
        setConversations((previous) =>
          previous.map((conversation) => {
            if (
              getConversationId(
                conversation
              ) !== incomingConversationId
            ) {
              return conversation;
            }

            return {
              ...conversation,
              lastMessage:
                incomingMessage,
              updatedAt:
                incomingMessage.createdAt ||
                new Date().toISOString(),
            };
          })
        );
      }
    );

    // ------------------------------------------
    // Typing
    // ------------------------------------------

    socket.on(
      "userTyping",
      (data) => {
        if (
          data?.conversationId?.toString() ===
          conversationIdRef.current
        ) {
          if (
            data?.userId?.toString() !==
            currentUserId
          ) {
            setOtherUserTyping(true);
          }
        }
      }
    );

    socket.on(
      "userStoppedTyping",
      (data) => {
        if (
          data?.conversationId?.toString() ===
          conversationIdRef.current
        ) {
          setOtherUserTyping(false);
        }
      }
    );

    // ------------------------------------------
    // Online / offline status
    // ------------------------------------------

    socket.on(
      "userStatusChanged",
      (data) => {
        if (!data?.userId) return;

        const changedUserId =
          data.userId.toString();

        setUsers((previousUsers) =>
          previousUsers.map((user) => {
            if (
              getUserId(user) !==
              changedUserId
            ) {
              return user;
            }

            return {
              ...user,
              isOnline: data.isOnline,
              lastSeen:
                data.lastSeen ||
                user.lastSeen ||
                null,
            };
          })
        );

        setConversations((previous) =>
          previous.map((conversation) => ({
            ...conversation,
            participants:
              conversation.participants?.map(
                (participant) => {
                  if (
                    getUserId(
                      participant
                    ) !== changedUserId
                  ) {
                    return participant;
                  }

                  return {
                    ...participant,
                    isOnline:
                      data.isOnline,
                    lastSeen:
                      data.lastSeen ||
                      participant.lastSeen ||
                      null,
                  };
                }
              ),
          }))
        );

        if (
          getUserId(selectedUser) ===
          changedUserId
        ) {
          setSelectedUser((previous) =>
            previous
              ? {
                  ...previous,
                  isOnline:
                    data.isOnline,
                  lastSeen:
                    data.lastSeen ||
                    previous.lastSeen ||
                    null,
                }
              : previous
          );
        }
      }
    );

    socket.on("disconnect", () => {
      console.log(
        "Socket disconnected"
      );
    });

    return () => {
      socket.off("connect");
      socket.off("receiveMessage");
      socket.off("userTyping");
      socket.off("userStoppedTyping");
      socket.off("userStatusChanged");
      socket.off("disconnect");

      socket.disconnect();

      socketRef.current = null;
    };
  }, [token, currentUserId]);

  // ----------------------------------------------
  // Join selected conversation room
  // ----------------------------------------------

  useEffect(() => {
    const socket = socketRef.current;

    if (!socket || !conversationId) {
      return;
    }

    socket.emit(
      "joinConversation",
      conversationId
    );

    return () => {
      socket.emit(
        "leaveConversation",
        conversationId
      );
    };
  }, [conversationId]);

  // ----------------------------------------------
  // Load profile
  // ----------------------------------------------

  const loadProfile = async () => {
    try {
      const response = await axios.get(
        `${API}/api/users/profile`,
        {
          headers: authHeaders(),
        }
      );

      const user =
        response.data?.user ||
        response.data;

      if (user) {
        setCurrentUser(user);

        localStorage.setItem(
          "chatUser",
          JSON.stringify(user)
        );

        setProfileName(
          user.name || ""
        );

        setProfileEmail(
          user.email || ""
        );
      }
    } catch (error) {
      console.error(
        "Profile loading error:",
        error
      );
    }
  };

  // ----------------------------------------------
  // Load conversations
  // ----------------------------------------------

  const loadConversations =
    async () => {
      try {
        const response =
          await axios.get(
            `${API}/api/conversations`,
            {
              headers: authHeaders(),
            }
          );

        const fetched =
          response.data?.conversations ||
          [];

        // Remove duplicate conversation
        // documents from the UI.
        const unique =
          dedupeConversations(
            fetched,
            currentUserId
          );

        setConversations(unique);

        // If a selected user already has
        // a conversation, keep the latest one.
        if (selectedUserIdRef.current) {
          const pairConversation =
            unique.find(
              (conversation) => {
                const other =
                  getOtherParticipant(
                    conversation,
                    currentUserId
                  );

                return (
                  getUserId(other) ===
                  selectedUserIdRef.current
                );
              }
            );

          if (pairConversation) {
            setConversationId(
              getConversationId(
                pairConversation
              )
            );
          }
        }
      } catch (error) {
        console.error(
          "Conversation loading error:",
          error
        );

        if (
          error.response?.status === 401
        ) {
          logout();
        }
      }
    };

  // ----------------------------------------------
  // Load conversations after login
  // ----------------------------------------------

  useEffect(() => {
    if (!token || !currentUserId) {
      return;
    }

    loadProfile();
    loadConversations();
  }, [token, currentUserId]);

  // ----------------------------------------------
  // Search users
  // ----------------------------------------------

  useEffect(() => {
    if (!token || !searchQuery.trim()) {
      setUsers([]);
      setShowSearchResults(false);
      return;
    }

    const timer = setTimeout(
      async () => {
        try {
          setSearchLoading(true);

          const response =
            await axios.get(
              `${API}/api/users/search`,
              {
                params: {
                  query:
                    searchQuery.trim(),
                },
                headers: authHeaders(),
              }
            );

          const result =
            response.data?.users ||
            response.data ||
            [];

          const filtered =
            dedupeUsers(result).filter(
              (user) =>
                getUserId(user) !==
                currentUserId
            );

          setUsers(filtered);
          setShowSearchResults(true);
        } catch (error) {
          console.error(
            "User search error:",
            error
          );

          setUsers([]);
        } finally {
          setSearchLoading(false);
        }
      },
      300
    );

    return () =>
      clearTimeout(timer);
  }, [
    searchQuery,
    token,
    currentUserId,
  ]);

  // ----------------------------------------------
  // Register
  // ----------------------------------------------

  const register = async (event) => {
    event.preventDefault();

    setAuthError("");

    if (
      !authForm.name.trim() ||
      !authForm.email.trim() ||
      !authForm.password
    ) {
      setAuthError(
        "Please fill all fields."
      );
      return;
    }

    try {
      setAuthLoading(true);

      const response =
        await axios.post(
          `${API}/api/auth/register`,
          {
            name: authForm.name.trim(),
            email:
              authForm.email.trim(),
            password:
              authForm.password,
          }
        );

      const newToken =
        response.data?.token;

      const user =
        response.data?.user;

      if (newToken && user) {
        saveAuth(
          newToken,
          user
        );
      } else {
        setAuthMode("login");

        setAuthError(
          "Registration successful. Please login."
        );
      }
    } catch (error) {
      setAuthError(
        error.response?.data?.message ||
          "Registration failed."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  // ----------------------------------------------
  // Login
  // ----------------------------------------------

  const login = async (event) => {
    event.preventDefault();

    setAuthError("");

    if (
      !authForm.email.trim() ||
      !authForm.password
    ) {
      setAuthError(
        "Please enter email and password."
      );
      return;
    }

    try {
      setAuthLoading(true);

      const response =
        await axios.post(
          `${API}/api/auth/login`,
          {
            email:
              authForm.email.trim(),
            password:
              authForm.password,
          }
        );

      const newToken =
        response.data?.token;

      const user =
        response.data?.user;

      if (!newToken || !user) {
        setAuthError(
          "Invalid login response."
        );
        return;
      }

      saveAuth(
        newToken,
        user
      );

      setAuthForm({
        name: "",
        email: "",
        password: "",
      });
    } catch (error) {
      setAuthError(
        error.response?.data?.message ||
          "Login failed."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  // ----------------------------------------------
  // Logout
  // ----------------------------------------------

  const logout = async () => {
    try {
      if (token) {
        await axios.post(
          `${API}/api/auth/logout`,
          {},
          {
            headers: authHeaders(),
          }
        );
      }
    } catch (error) {
      console.error(
        "Logout error:",
        error
      );
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    localStorage.removeItem(
      "chatToken"
    );

    localStorage.removeItem(
      "chatUser"
    );

    setToken("");
    setCurrentUser(null);
    setUsers([]);
    setConversations([]);
    setSelectedUser(null);
    setConversationId("");
    setMessages([]);
    setMessageText("");
    setNotificationCount(0);
    setUnreadCounts({});
    setShowProfile(false);
    setShowMenu(false);
  };

  // ----------------------------------------------
  // Create/open chat
  // ----------------------------------------------

  const openChat = async (user) => {
    if (!user) return;

    const userId = getUserId(user);

    if (!userId || userId === currentUserId) {
      return;
    }

    setSelectedUser(user);
    setSelectedUserIdRef(userId);
    setShowSearchResults(false);
    setSearchQuery("");
    setMobileSidebarOpen(false);
    setOtherUserTyping(false);
    setMessages([]);

    try {
      // First check our deduplicated conversation list.
      let existingConversation =
        conversations.find(
          (conversation) => {
            const other =
              getOtherParticipant(
                conversation,
                currentUserId
              );

            return (
              getUserId(other) ===
              userId
            );
          }
        );

      // If it doesn't exist, ask backend to
      // create/find it.
      if (!existingConversation) {
        const response =
          await axios.post(
            `${API}/api/conversations`,
            {
              userId,
            },
            {
              headers:
                authHeaders(),
            }
          );

        existingConversation =
          response.data?.conversation;

        if (
          existingConversation
        ) {
          setConversations(
            (previous) =>
              dedupeConversations(
                [
                  existingConversation,
                  ...previous,
                ],
                currentUserId
              )
          );
        }
      }

      if (!existingConversation) {
        setErrorMessage(
          "Unable to open conversation."
        );
        return;
      }

      const newConversationId =
        getConversationId(
          existingConversation
        );

      setConversationId(
        newConversationId
      );

      conversationIdRef.current =
        newConversationId;

      // Join socket room immediately.
      if (socketRef.current) {
        socketRef.current.emit(
          "joinConversation",
          newConversationId
        );
      }

      // Load history.
      await loadMessages(
        newConversationId
      );

      // Clear only this conversation's unread count.
      setUnreadCounts(
        (previous) => {
          const updated = {
            ...previous,
          };

          delete updated[
            newConversationId
          ];

          return updated;
        }
      );
    } catch (error) {
      console.error(
        "Open chat error:",
        error
      );

      setErrorMessage(
        error.response?.data?.message ||
          "Unable to open chat."
      );
    }
  };

  // ----------------------------------------------
  // Small helper because selected user ID
  // needs to be kept in a ref too.
  // ----------------------------------------------

  const setSelectedUserIdRef =
    (userId) => {
      selectedUserIdRef.current =
        userId;
    };

  // ----------------------------------------------
  // Load messages
  // ----------------------------------------------

  const loadMessages = async (
    id
  ) => {
    if (!id) return;

    try {
      setLoadingMessages(true);

      const response =
        await axios.get(
          `${API}/api/messages/${id}`,
          {
            headers: authHeaders(),
          }
        );

      const fetched =
        response.data?.messages ||
        response.data ||
        [];

      // Remove duplicate messages.
      const uniqueMessages = [];

      const seen = new Set();

      fetched.forEach((message) => {
        const id =
          message._id ||
          `${message.sender}-${message.createdAt}-${message.content}`;

        if (seen.has(id)) {
          return;
        }

        seen.add(id);
        uniqueMessages.push(message);
      });

      setMessages(
        uniqueMessages
      );
    } catch (error) {
      console.error(
        "Message loading error:",
        error
      );

      setErrorMessage(
        error.response?.data?.message ||
          "Unable to load messages."
      );
    } finally {
      setLoadingMessages(false);
    }
  };

  // ----------------------------------------------
  // Send message
  // ----------------------------------------------

  const sendMessage = async () => {
    const content =
      messageText.trim();

    if (
      !content ||
      !conversationId ||
      sending
    ) {
      return;
    }

    try {
      setSending(true);

      stopTyping();

      // IMPORTANT:
      // REST API saves the message.
      // Backend then broadcasts receiveMessage
      // through Socket.IO.
      const response =
        await axios.post(
          `${API}/api/messages`,
          {
            conversationId,
            content,
          },
          {
            headers: authHeaders(),
          }
        );

      const sentMessage =
        response.data?.data;

      // Usually receiveMessage will arrive
      // through Socket.IO. This fallback prevents
      // the UI from remaining empty if the socket
      // event is delayed.
      if (sentMessage) {
        setMessages((previous) => {
          const exists =
            previous.some(
              (message) =>
                message._id &&
                sentMessage._id &&
                message._id.toString() ===
                  sentMessage._id.toString()
            );

          if (exists) {
            return previous;
          }

          return [
            ...previous,
            sentMessage,
          ];
        });

        setConversations(
          (previous) =>
            previous.map(
              (conversation) =>
                getConversationId(
                  conversation
                ) === conversationId
                  ? {
                      ...conversation,
                      lastMessage:
                        sentMessage,
                      updatedAt:
                        sentMessage.createdAt ||
                        new Date().toISOString(),
                    }
                  : conversation
            )
        );
      }

      setMessageText("");
    } catch (error) {
      console.error(
        "Send message error:",
        error
      );

      setErrorMessage(
        error.response?.data?.message ||
          "Message could not be sent."
      );
    } finally {
      setSending(false);
    }
  };

  // ----------------------------------------------
  // Typing
  // ----------------------------------------------

  const handleTyping = (value) => {
    setMessageText(value);

    if (!conversationId) {
      return;
    }

    if (!socketRef.current) {
      return;
    }

    socketRef.current.emit(
      "typing",
      {
        conversationId,
        userId: currentUserId,
      }
    );

    setIsTyping(true);

    if (typingTimeoutRef.current) {
      clearTimeout(
        typingTimeoutRef.current
      );
    }

    typingTimeoutRef.current =
      setTimeout(() => {
        stopTyping();
      }, 1200);
  };

  const stopTyping = () => {
    if (
      socketRef.current &&
      conversationId
    ) {
      socketRef.current.emit(
        "stopTyping",
        {
          conversationId,
          userId: currentUserId,
        }
      );
    }

    setIsTyping(false);

    if (typingTimeoutRef.current) {
      clearTimeout(
        typingTimeoutRef.current
      );

      typingTimeoutRef.current =
        null;
    }
  };

  // ----------------------------------------------
  // Enter key
  // ----------------------------------------------

  const handleMessageKeyDown = (
    event
  ) => {
    if (event.key === "Enter") {
      if (event.shiftKey) {
        return;
      }

      event.preventDefault();
      sendMessage();
    }
  };

  // ----------------------------------------------
  // Save profile
  // ----------------------------------------------

  const saveProfile = async () => {
    if (!profileName.trim()) {
      setErrorMessage(
        "Name cannot be empty."
      );
      return;
    }

    try {
      setProfileSaving(true);

      const response =
        await axios.put(
          `${API}/api/users/profile`,
          {
            name:
              profileName.trim(),
          },
          {
            headers: authHeaders(),
          }
        );

      const updatedUser =
        response.data?.user ||
        response.data;

      if (updatedUser) {
        setCurrentUser(
          updatedUser
        );

        localStorage.setItem(
          "chatUser",
          JSON.stringify(
            updatedUser
          )
        );

        setSelectedUser(
          (previous) =>
            previous
        );
      }

      setShowProfile(false);
    } catch (error) {
      console.error(
        "Profile update error:",
        error
      );

      setErrorMessage(
        error.response?.data?.message ||
          "Profile update failed."
      );
    } finally {
      setProfileSaving(false);
    }
  };

  // ----------------------------------------------
  // Upload profile picture
  // ----------------------------------------------

  const uploadProfilePicture = async (
    event
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) return;

    try {
      setProfilePictureUploading(
        true
      );

      const formData =
        new FormData();

      formData.append(
        "profilePicture",
        file
      );

      const response =
        await axios.put(
          `${API}/api/users/profile-picture`,
          formData,
          {
            headers: {
              ...authHeaders(),
              "Content-Type":
                "multipart/form-data",
            },
          }
        );

      const updatedUser =
        response.data?.user ||
        response.data;

      if (updatedUser) {
        setCurrentUser(
          updatedUser
        );

        localStorage.setItem(
          "chatUser",
          JSON.stringify(
            updatedUser
          )
        );
      }
    } catch (error) {
      console.error(
        "Profile picture error:",
        error
      );

      setErrorMessage(
        error.response?.data?.message ||
          "Profile picture upload failed."
      );
    } finally {
      setProfilePictureUploading(
        false
      );

      event.target.value = "";
    }
  };

  // ----------------------------------------------
  // Current selected conversation
  // ----------------------------------------------

  const selectedConversation =
    useMemo(() => {
      if (!conversationId) {
        return null;
      }

      return (
        conversations.find(
          (conversation) =>
            getConversationId(
              conversation
            ) === conversationId
        ) || null
      );
    }, [
      conversations,
      conversationId,
    ]);

  // ----------------------------------------------
  // Recent chats
  // ----------------------------------------------

  const recentChats = useMemo(() => {
    return dedupeConversations(
      conversations,
      currentUserId
    );
  }, [
    conversations,
    currentUserId,
  ]);

  // ----------------------------------------------
  // Authentication screen
  // ----------------------------------------------

  if (!token || !currentUser) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon">
              <MessageCircle
                size={30}
              />
            </div>

            <h1>ChatFlow</h1>
          </div>

          <p className="auth-subtitle">
            Real-time conversations,
            made simple.
          </p>

          <div className="auth-tabs">
            <button
              className={
                authMode === "login"
                  ? "active"
                  : ""
              }
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
              }}
            >
              Login
            </button>

            <button
              className={
                authMode === "register"
                  ? "active"
                  : ""
              }
              onClick={() => {
                setAuthMode(
                  "register"
                );
                setAuthError("");
              }}
            >
              Register
            </button>
          </div>

          {authError && (
            <div className="auth-error">
              {authError}
            </div>
          )}

          <form
            onSubmit={
              authMode === "login"
                ? login
                : register
            }
          >
            {authMode ===
              "register" && (
              <div className="form-group">
                <label>
                  Full Name
                </label>

                <input
                  type="text"
                  placeholder="Enter your name"
                  value={
                    authForm.name
                  }
                  onChange={(event) =>
                    setAuthForm(
                      (previous) => ({
                        ...previous,
                        name:
                          event.target
                            .value,
                      })
                    )
                  }
                />
              </div>
            )}

            <div className="form-group">
              <label>
                Email
              </label>

              <input
                type="email"
                placeholder="Enter your email"
                value={
                  authForm.email
                }
                onChange={(event) =>
                  setAuthForm(
                    (previous) => ({
                      ...previous,
                      email:
                        event.target
                          .value,
                    })
                  )
                }
              />
            </div>

            <div className="form-group">
              <label>
                Password
              </label>

              <input
                type="password"
                placeholder="Enter your password"
                value={
                  authForm.password
                }
                onChange={(event) =>
                  setAuthForm(
                    (previous) => ({
                      ...previous,
                      password:
                        event.target
                          .value,
                    })
                  )
                }
              />
            </div>

            <button
              type="submit"
              className="auth-submit"
              disabled={authLoading}
            >
              {authLoading
                ? "Please wait..."
                : authMode ===
                  "login"
                ? "Login"
                : "Create Account"}
            </button>
          </form>

          <div className="auth-footer">
            <span>
              Real-Time Chat Application
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------
  // Main chat UI
  // ----------------------------------------------

  return (
    <div className="chat-app">
      {/* ----------------------------------------
          Sidebar
      ----------------------------------------- */}

      <aside
        className={`sidebar ${
          mobileSidebarOpen
            ? "mobile-open"
            : ""
        }`}
      >
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-icon">
              <MessageCircle
                size={22}
              />
            </div>

            <span>ChatFlow</span>
          </div>

          <div className="sidebar-actions">
            <button
              className="icon-button"
              title="Notifications"
              onClick={() =>
                setNotificationCount(
                  0
                )
              }
            >
              <Bell size={20} />

              {notificationCount >
                0 && (
                <span className="notification-badge">
                  {notificationCount >
                  99
                    ? "99+"
                    : notificationCount}
                </span>
              )}
            </button>

            <button
              className="icon-button"
              title="Profile"
              onClick={() =>
                setShowProfile(
                  true
                )
              }
            >
              <UserCircle
                size={21}
              />
            </button>
          </div>
        </div>

        {/* Profile mini card */}

        <div className="profile-mini">
          <div className="avatar">
            {currentUser.profilePicture ? (
              <img
                src={
                  currentUser.profilePicture
                }
                alt={
                  currentUser.name
                }
              />
            ) : (
              getInitials(
                currentUser.name
              )
            )}

            <span className="online-dot" />
          </div>

          <div className="profile-mini-info">
            <strong>
              {currentUser.name}
            </strong>

            <span>
              {currentUser.email}
            </span>
          </div>

          <button
            className="icon-button"
            onClick={() =>
              setShowMenu(
                (previous) =>
                  !previous
              )
            }
          >
            <MoreVertical
              size={19}
            />
          </button>

          {showMenu && (
            <div className="profile-menu">
              <button
                onClick={() => {
                  setShowMenu(
                    false
                  );
                  setShowProfile(
                    true
                  );
                }}
              >
                <Settings
                  size={17}
                />
                Profile Settings
              </button>

              <button
                onClick={logout}
              >
                <LogOut
                  size={17}
                />
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Search */}

        <div className="search-box">
          <Search size={18} />

          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(event) =>
              setSearchQuery(
                event.target.value
              )
            }
          />

          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => {
                setSearchQuery("");
                setUsers([]);
                setShowSearchResults(
                  false
                );
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Search results */}

        {showSearchResults && (
          <div className="search-results">
            <div className="section-title">
              Search Results
            </div>

            {searchLoading && (
              <div className="empty-small">
                Searching...
              </div>
            )}

            {!searchLoading &&
              users.length ===
                0 && (
                <div className="empty-small">
                  No users found
                </div>
              )}

            {!searchLoading &&
              users.map((user) => (
                <button
                  className="user-result"
                  key={getUserId(
                    user
                  )}
                  onClick={() =>
                    openChat(user)
                  }
                >
                  <div className="avatar">
                    {user.profilePicture ? (
                      <img
                        src={
                          user.profilePicture
                        }
                        alt={
                          user.name
                        }
                      />
                    ) : (
                      getInitials(
                        user.name
                      )
                    )}

                    {user.isOnline && (
                      <span className="online-dot" />
                    )}
                  </div>

                  <div className="user-result-info">
                    <strong>
                      {user.name}
                    </strong>

                    <span>
                      {user.isOnline
                        ? "Online"
                        : "Offline"}
                    </span>
                  </div>
                </button>
              ))}
          </div>
        )}

        {/* Recent chats */}

        <div className="recent-header">
          <span>
            Recent Chats
          </span>

          <span className="chat-count">
            {recentChats.length}
          </span>
        </div>

        <div className="conversation-list">
          {recentChats.length ===
            0 && (
            <div className="empty-chats">
              <MessageCircle
                size={30}
              />

              <p>
                No conversations
                yet
              </p>

              <span>
                Search for a user
                to start chatting
              </span>
            </div>
          )}

          {recentChats.map(
            (conversation) => {
              const otherUser =
                getOtherParticipant(
                  conversation,
                  currentUserId
                );

              if (!otherUser) {
                return null;
              }

              const id =
                getConversationId(
                  conversation
                );

              const unread =
                unreadCounts[id] ||
                0;

              const lastMessage =
                conversation.lastMessage;

              const preview =
                lastMessage?.content ||
                "Start a conversation";

              return (
                <button
                  key={id}
                  className={`conversation-item ${
                    conversationId ===
                    id
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    openChat(
                      otherUser
                    )
                  }
                >
                  <div className="avatar">
                    {otherUser.profilePicture ? (
                      <img
                        src={
                          otherUser.profilePicture
                        }
                        alt={
                          otherUser.name
                        }
                      />
                    ) : (
                      getInitials(
                        otherUser.name
                      )
                    )}

                    {otherUser.isOnline && (
                      <span className="online-dot" />
                    )}
                  </div>

                  <div className="conversation-info">
                    <div className="conversation-top">
                      <strong>
                        {
                          otherUser.name
                        }
                      </strong>

                      {lastMessage?.createdAt && (
                        <time>
                          {formatTime(
                            lastMessage.createdAt
                          )}
                        </time>
                      )}
                    </div>

                    <div className="conversation-bottom">
                      <span>
                        {preview.length >
                        38
                          ? `${preview.slice(
                              0,
                              38
                            )}...`
                          : preview}
                      </span>

                      {unread >
                        0 && (
                        <span className="unread-badge">
                          {unread >
                          99
                            ? "99+"
                            : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            }
          )}
        </div>
      </aside>

      {/* ----------------------------------------
          Main Chat
      ----------------------------------------- */}

      <main className="chat-main">
        {/* Chat header */}

        {selectedUser ? (
          <>
            <header className="chat-header">
              <div className="chat-header-left">
                <button
                  className="mobile-menu-button"
                  onClick={() =>
                    setMobileSidebarOpen(
                      (previous) =>
                        !previous
                    )
                  }
                >
                  <Menu size={22} />
                </button>

                <div className="avatar">
                  {selectedUser.profilePicture ? (
                    <img
                      src={
                        selectedUser.profilePicture
                      }
                      alt={
                        selectedUser.name
                      }
                    />
                  ) : (
                    getInitials(
                      selectedUser.name
                    )
                  )}

                  {selectedUser.isOnline && (
                    <span className="online-dot" />
                  )}
                </div>

                <div className="chat-user-info">
                  <h2>
                    {selectedUser.name}
                  </h2>

                  <span>
                    {otherUserTyping
                      ? "typing..."
                      : selectedUser.isOnline
                      ? "online"
                      : formatLastSeen(
                          selectedUser.lastSeen
                        )}
                  </span>
                </div>
              </div>

              <div className="chat-header-actions">
                <button
                  className="icon-button"
                  title="Voice call"
                  onClick={() =>
                    setErrorMessage(
                      "Voice calling is a visual placeholder in this mini project."
                    )
                  }
                >
                  <Phone size={19} />
                </button>

                <button
                  className="icon-button"
                  title="Video call"
                  onClick={() =>
                    setErrorMessage(
                      "Video calling is a visual placeholder in this mini project."
                    )
                  }
                >
                  <Video size={20} />
                </button>

                <button
                  className="icon-button"
                  title="More"
                  onClick={() =>
                    setShowMenu(
                      (previous) =>
                        !previous
                    )
                  }
                >
                  <MoreVertical
                    size={20}
                  />
                </button>
              </div>
            </header>

            {/* Messages */}

            <section className="messages-area">
              {loadingMessages && (
                <div className="messages-loading">
                  Loading messages...
                </div>
              )}

              {!loadingMessages &&
                messages.length ===
                  0 && (
                  <div className="chat-empty">
                    <div className="chat-empty-icon">
                      <MessageCircle
                        size={30}
                      />
                    </div>

                    <h3>
                      Start chatting
                    </h3>

                    <p>
                      Send a message to{" "}
                      {
                        selectedUser.name
                      }
                    </p>
                  </div>
                )}

              {!loadingMessages &&
                messages.map(
                  (message) => {
                    const senderId =
                      getUserId(
                        message.sender
                      );

                    const isOwn =
                      senderId ===
                      currentUserId;

                    return (
                      <div
                        key={
                          message._id ||
                          `${senderId}-${message.createdAt}-${message.content}`
                        }
                        className={`message-row ${
                          isOwn
                            ? "own"
                            : "other"
                        }`}
                      >
                        <div className="message-bubble">
                          <div className="message-content">
                            {message.isDeleted
                              ? "This message was deleted."
                              : message.content}
                          </div>

                          <div className="message-meta">
                            <time>
                              {formatTime(
                                message.createdAt
                              )}
                            </time>

                            {isOwn && (
                              <CheckCheck
                                size={15}
                                className="read-icon"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}

              {otherUserTyping && (
                <div className="message-row other">
                  <div className="typing-bubble">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}

              <div
                ref={
                  messagesEndRef
                }
              />
            </section>

            {/* Composer */}

            <div className="message-composer">
              <button
                className="composer-icon"
                title="Emoji"
                onClick={() =>
                  setMessageText(
                    (previous) =>
                      previous +
                      " 😊"
                  )
                }
              >
                <Smile size={21} />
              </button>

              <input
                type="text"
                placeholder={`Message ${selectedUser.name}...`}
                value={messageText}
                onChange={(event) =>
                  handleTyping(
                    event.target.value
                  )
                }
                onKeyDown={
                  handleMessageKeyDown
                }
                onBlur={
                  stopTyping
                }
              />

              <button
                className="composer-icon"
                title="More options"
                onClick={() =>
                  setErrorMessage(
                    "File sharing is not included in this mini project."
                  )
                }
              >
                <Plus size={21} />
              </button>

              <button
                className="send-button"
                disabled={
                  !messageText.trim() ||
                  sending
                }
                onClick={
                  sendMessage
                }
              >
                <Send size={19} />
              </button>
            </div>
          </>
        ) : (
          /* ------------------------------------
             Welcome screen
          ------------------------------------- */

          <div className="welcome-screen">
            <button
              className="mobile-menu-button welcome-menu"
              onClick={() =>
                setMobileSidebarOpen(
                  (previous) =>
                    !previous
                )
              }
            >
              <Menu size={23} />
            </button>

            <div className="welcome-icon">
              <MessageCircle
                size={42}
              />
            </div>

            <h1>
              Welcome to ChatFlow
            </h1>

            <p>
              Select a conversation
              from the sidebar or
              search for a user to
              start chatting.
            </p>

            <div className="welcome-features">
              <span>
                <Check size={16} />
                Real-time messaging
              </span>

              <span>
                <Check size={16} />
                Online status
              </span>

              <span>
                <Check size={16} />
                Message history
              </span>
            </div>
          </div>
        )}
      </main>

      {/* ----------------------------------------
          Profile Modal
      ----------------------------------------- */}

      {showProfile && (
        <div
          className="modal-overlay"
          onClick={() =>
            setShowProfile(false)
          }
        >
          <div
            className="profile-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <h2>
                Profile Settings
              </h2>

              <button
                className="icon-button"
                onClick={() =>
                  setShowProfile(
                    false
                  )
                }
              >
                <X size={20} />
              </button>
            </div>

            <div className="profile-picture-section">
              <div className="large-avatar">
                {currentUser.profilePicture ? (
                  <img
                    src={
                      currentUser.profilePicture
                    }
                    alt={
                      currentUser.name
                    }
                  />
                ) : (
                  getInitials(
                    currentUser.name
                  )
                )}
              </div>

              <label className="upload-button">
                {profilePictureUploading
                  ? "Uploading..."
                  : "Change Photo"}

                <input
                  type="file"
                  accept="image/*"
                  onChange={
                    uploadProfilePicture
                  }
                  disabled={
                    profilePictureUploading
                  }
                />
              </label>
            </div>

            <div className="form-group">
              <label>
                Name
              </label>

              <input
                type="text"
                value={
                  profileName
                }
                onChange={(event) =>
                  setProfileName(
                    event.target
                      .value
                  )
                }
              />
            </div>

            <div className="form-group">
              <label>
                Email
              </label>

              <input
                type="email"
                value={
                  profileEmail
                }
                disabled
              />
            </div>

            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() =>
                  setShowProfile(
                    false
                  )
                }
              >
                Cancel
              </button>

              <button
                className="primary-button"
                onClick={
                  saveProfile
                }
                disabled={
                  profileSaving
                }
              >
                {profileSaving
                  ? "Saving..."
                  : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------
          Error toast
      ----------------------------------------- */}

      {errorMessage && (
        <div className="error-toast">
          <span>
            {errorMessage}
          </span>

          <button
            onClick={() =>
              setErrorMessage("")
            }
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;