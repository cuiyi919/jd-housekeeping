import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import page from './src/page.generated.json';
import { createStore, validateRaw } from './src/storage.cjs';

const store = createStore(AsyncStorage);
const js = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const message = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。';

async function shareBackup(raw: string, prefix = '京东家政记录') {
  if (!await Sharing.isAvailableAsync()) throw Error('此设备暂不支持文件分享。');
  const file = new File(Paths.cache, `${prefix}-${Date.now()}.json`);
  file.create({ overwrite: true });
  file.write(raw);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: '保存家政记录备份' });
}

async function pickBackup() {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  if (file.size > 5000000) throw Error('备份文件不能超过5 MB。');
  return validateRaw(await file.text());
}

function Housekeeping() {
  const view = useRef<WebView>(null);
  const [source, setSource] = useState<{ html: string }>();
  const [error, setError] = useState('');
  const [recovering, setRecovering] = useState(false);
  const busy = useRef(false);

  async function load() {
    setError('');
    setSource(undefined);
    try {
      const initial = await store.load();
      setSource({ html: page.replace('/*PHONE_BOOTSTRAP*/', () => `window.PHONE_INITIAL=${js(initial)};`) });
    } catch (e) { setError(message(e)); }
  }
  useEffect(() => { void load(); }, []);
  const inject = (code: string) => view.current?.injectJavaScript(code + ';true;');

  async function onMessage(event: WebViewMessageEvent) {
    let id = 0;
    let type = '';
    try {
      const data = JSON.parse(event.nativeEvent.data);
      id = data.id;
      type = data.type;
      if (!Number.isInteger(id)) throw Error('无效的页面消息。');
      if (type === 'save') {
        await store.save(validateRaw(data.payload));
        inject(`window.phoneReply(${id},null)`);
        return;
      }
      if (busy.current) return;
      busy.current = true;
      try {
        if (type === 'export') await shareBackup(validateRaw(data.payload));
        else if (type === 'import') {
          const raw = await pickBackup();
          if (raw !== null) inject(`window.phoneImport(${js(raw)})`);
        } else if (type === 'replace') {
          const raw = validateRaw(data.payload);
          await store.replace(raw);
          inject(`window.phoneCommitImport(${js(raw)})`);
        }
      } finally { busy.current = false; }
    } catch (e) {
      if (type === 'save') inject(`window.phoneReply(${id},${js(message(e))})`);
      else {
        if (type === 'replace') inject('window.phoneImportFailed()');
        Alert.alert('操作未完成', message(e));
      }
    }
  }

  async function recoverImport() {
    try {
      const raw = await pickBackup();
      if (raw === null) return;
      Alert.alert('导入备份', '将替换手机上的记录，原始数据会保留恢复副本。', [
        { text: '取消', style: 'cancel' },
        { text: '替换并导入', onPress: () => { void (async () => {
          setRecovering(true);
          try { await store.replace(raw); await load(); }
          catch (e) { Alert.alert('导入失败', message(e)); }
          finally { setRecovering(false); }
        })(); } },
      ]);
    } catch (e) { Alert.alert('无法导入', message(e)); }
  }

  async function exportRecovery() {
    try {
      const raw = await store.recovery();
      if (raw === null) { Alert.alert('暂无恢复副本', '首次导入替换前，会自动保留原记录副本。'); return; }
      await shareBackup(raw, '京东家政-导入前记录');
    } catch (e) { Alert.alert('导出失败', message(e)); }
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <StatusBar style="dark" />
    <View style={styles.notice}>
      <Text style={styles.noticeText}>本机记录 · 个人家政工具</Text>
      <Pressable accessibilityRole="button" onPress={exportRecovery} style={styles.recovery}><Text style={styles.link}>恢复副本</Text></Pressable>
    </View>
    {error ? <View style={styles.center}>
      <Text style={styles.title}>记录暂时无法打开</Text>
      <Text style={styles.body}>{error}{'\n'}已停止写入，原有数据仍保留。</Text>
      <Pressable disabled={recovering} style={styles.button} onPress={load}><Text style={styles.buttonText}>重新读取</Text></Pressable>
      <Pressable disabled={recovering} style={styles.button} onPress={async () => {
        try { const raw = await store.raw(); if (raw !== null) await shareBackup(raw, '京东家政-原始数据'); }
        catch (e) { Alert.alert('导出失败', message(e)); }
      }}><Text style={styles.buttonText}>导出原始数据</Text></Pressable>
      <Pressable disabled={recovering} style={styles.button} onPress={recoverImport}><Text style={styles.buttonText}>从备份恢复</Text></Pressable>
    </View> : source ? <WebView
      ref={view}
      source={source}
      style={styles.web}
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url.startsWith('about:blank#')}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled={false}
      allowFileAccess={false}
      setSupportMultipleWindows={false}
      textZoom={100}
      onError={event => setError(event.nativeEvent.description)}
      onContentProcessDidTerminate={() => { void load(); }}
    /> : <View style={styles.center}><ActivityIndicator color="#006f98" /><Text style={styles.body}>正在读取本机记录…</Text></View>}
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><Housekeeping /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#e8f5fa' },
  notice: { paddingLeft: 16, paddingRight: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noticeText: { color: '#507184', fontSize: 12 },
  recovery: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  link: { color: '#006f98', fontSize: 12 },
  web: { flex: 1, backgroundColor: '#e8f5fa' },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 23, fontWeight: '600', color: '#133e52' },
  body: { color: '#507184', lineHeight: 24 },
  button: { padding: 14, borderRadius: 12, backgroundColor: '#006f98', alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 16 },
});
