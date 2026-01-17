
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileSpreadsheet, FileText, Send, Bot, AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { fileParser } from '../services/fileParser';
import { GoogleGenAI } from "@google/genai";

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

interface Insight {
  type: 'warning' | 'success' | 'info';
  message: string;
}

export const PricingAI: React.FC = () => {
  // State
  const [files, setFiles] = useState<{ pdf: File | null; excel: File | null }>({ pdf: null, excel: null });
  const [contextData, setContextData] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize AI
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'pdf' | 'excel') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFiles(prev => ({ ...prev, [type]: file }));
      
      setIsProcessing(true);
      try {
        let extractedText = "";
        if (type === 'pdf') {
          extractedText = await fileParser.pdfToText(file);
          // Run NKBA Auto-Check on PDF upload
          await generateNkbaInsights(extractedText);
        } else {
          extractedText = await fileParser.excelToString(file);
        }
        
        setContextData(prev => prev + `\n\n--- FILE: ${file.name} (${type.toUpperCase()}) ---\n${extractedText}`);
        
        // Add system message
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          sender: 'ai',
          text: `I've analyzed ${file.name}. ${type === 'excel' ? 'I can now answer pricing questions.' : 'I can check cabinet codes and NKBA rules.'}`,
          timestamp: new Date()
        }]);

      } catch (err) {
        console.error(err);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          sender: 'ai',
          text: `Error reading ${file.name}. Please try again.`,
          timestamp: new Date()
        }]);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const generateNkbaInsights = async (text: string) => {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-latest',
        contents: `Analyze this kitchen floor plan text data for NKBA rule compliance. 
        Identify 3 potential issues or good points (e.g. Landing zones, Work Triangle, Walkways).
        Return purely a JSON array of objects with 'type' (warning, success, info) and 'message'.
        
        DATA: ${text.substring(0, 5000)}`,
        config: { responseMimeType: 'application/json' }
      });
      
      if (response.text) {
        const data = JSON.parse(response.text);
        setInsights(data);
      }
    } catch (e) {
      console.warn("NKBA Check failed", e);
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsAiThinking(true);
    
    // Scroll to bottom
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    try {
      const prompt = `
        You are an expert Kitchen Estimator and Designer.
        Use the following extracted file data to answer the user's question.
        
        CONTEXT DATA:
        ${contextData}
        
        USER QUESTION: "${input}"
        
        If asking for price, look up codes in the Excel data.
        If asking for design errors, check the PDF data against NKBA rules.
        Be precise.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-latest',
        contents: prompt
      });

      const aiMsg: Message = { 
        id: (Date.now()+1).toString(), 
        sender: 'ai', 
        text: response.text || "I couldn't find an answer in the files.", 
        timestamp: new Date() 
      };
      setMessages(prev => [...prev, aiMsg]);

    } catch (err) {
      setMessages(prev => [...prev, { 
        id: (Date.now()+1).toString(), 
        sender: 'ai', 
        text: "Sorry, I encountered an error processing that request.", 
        timestamp: new Date() 
      }]);
    } finally {
      setIsAiThinking(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200">
      
      {/* Top Panel: File Uploads & Insights */}
      <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row gap-4 shrink-0">
        
        {/* Upload Buttons */}
        <div className="flex gap-4">
          <div className="relative group">
            <input type="file" accept=".pdf" onChange={(e) => handleFileUpload(e, 'pdf')} className="absolute inset-0 opacity-0 cursor-pointer z-10"/>
            <div className={`h-24 w-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-all ${files.pdf ? 'border-green-500 bg-green-900/10' : 'border-slate-600 hover:border-blue-500 bg-slate-800'}`}>
              <FileText className={files.pdf ? 'text-green-500' : 'text-slate-400'} />
              <span className="text-xs mt-2 font-medium">{files.pdf ? 'PDF Added' : 'Upload PDF'}</span>
            </div>
          </div>

          <div className="relative group">
            <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFileUpload(e, 'excel')} className="absolute inset-0 opacity-0 cursor-pointer z-10"/>
            <div className={`h-24 w-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-all ${files.excel ? 'border-green-500 bg-green-900/10' : 'border-slate-600 hover:border-blue-500 bg-slate-800'}`}>
              <FileSpreadsheet className={files.excel ? 'text-green-500' : 'text-slate-400'} />
              <span className="text-xs mt-2 font-medium">{files.excel ? 'Excel Added' : 'Upload Excel'}</span>
            </div>
          </div>
        </div>

        {/* NKBA Insights Ticker */}
        <div className="flex-1 bg-slate-800/50 rounded-lg p-3 border border-slate-700 overflow-y-auto max-h-24">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-yellow-400"/>
            <span className="text-xs font-bold text-slate-400 uppercase">AI Design Insights</span>
          </div>
          {insights.length > 0 ? (
            <div className="space-y-2">
              {insights.map((insight, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  {insight.type === 'warning' && <AlertTriangle size={12} className="text-red-400 mt-0.5" />}
                  {insight.type === 'success' && <CheckCircle2 size={12} className="text-green-400 mt-0.5" />}
                  {insight.type === 'info' && <Bot size={12} className="text-blue-400 mt-0.5" />}
                  <span className="text-slate-300">{insight.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">Upload a PDF to see NKBA design suggestions...</p>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
            <Bot size={48} className="mb-4" />
            <p>Upload files to start the Pricing & Design Agent</p>
          </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              msg.sender === 'user' 
                ? 'bg-blue-600 text-white rounded-tr-sm' 
                : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              <span className="text-[10px] opacity-50 block mt-1 text-right">
                {msg.timestamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
              </span>
            </div>
          </div>
        ))}
        {isAiThinking && (
          <div className="flex justify-start">
             <div className="bg-slate-800 rounded-2xl px-4 py-3 rounded-tl-sm border border-slate-700 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-blue-400"/>
                <span className="text-xs text-slate-400">Analyzing...</span>
             </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-slate-900 border-t border-slate-800">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about pricing, cabinet codes, or design mistakes..."
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isAiThinking}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white p-3 rounded-xl transition-colors"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};
