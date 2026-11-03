export type Channel = 'web' | 'phone' | 'instagram';
export type Stage = 'new' | 'replied' | 'booked' | 'assessed' | 'sold' | 'lost';
export interface Person { id: string; name: string; phone: string; email: string; athlete?: string; sport?: string }
export interface Lead { id: string; personId: string; channel: Channel; stage: Stage; createdAt: number; firstMessage: string; repliedAt?: number; unread: boolean }
export interface Package { id: string; category: string; name: string; sessions: number; price: number; perPerson?: boolean }
export interface Booking { id: string; personId: string; kind: 'assessment'; start: number; status: 'booked' | 'completed' | 'noshow' }
export interface Message { id: string; personId: string; dir: 'in' | 'out'; channel: Channel | 'sms' | 'email'; body: string; at: number; simulated?: boolean; auto?: string }
export interface Sale { id: string; personId: string; packageId: string; at: number; sessionsUsed: number; reminderSentAt?: number; renewedFromId?: string }
export interface FollowUpStep { day: number; label: string; channel: 'sms' | 'email'; body: (p: Person, pkg?: Package) => string }
export interface Chip { label: string; act: string }
export interface ChatMsg { id: string; from: 'bot' | 'user'; text: string; chips?: Chip[]; used?: boolean }
export interface ChatState { msgs: ChatMsg[]; queue: { msg: ChatMsg; dueAt: number }[]; mode: 'idle' | 'name'; name?: string; personId?: string; handedOff?: boolean; wantSlots?: boolean }
export type AgentStatus = 'pending' | 'running' | 'approved' | 'dismissed';
export interface AgentEntry { status: AgentStatus; kind: string; title: string; body: string; personId?: string; at: number; dueAt?: number; result?: string; edited?: boolean }
export interface DemoState { people: Person[]; leads: Lead[]; bookings: Booking[]; messages: Message[]; sales: Sale[]; followUpsSent: Record<string, number>; chat: ChatState; agent: Record<string, AgentEntry> }
