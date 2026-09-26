import React from 'react';
import { View, Text, Button } from 'react-native';
import { reportNonFatal } from './services/crashReporter';
import { classifyReaderError, getReaderDiagnostic } from './services/readerDiagnostics';

/** Keep local data intact when initialization or a screen fails. */
export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const diagnostic = getReaderDiagnostic();
    const classified = classifyReaderError(error);
    console.error('[AppRenderFailure]', JSON.stringify({
      ...diagnostic, ...classified,
      httpStatus: diagnostic.httpStatus ?? classified.httpStatus,
      readerRender: diagnostic.screen === 'Reader' ? 'failed' : diagnostic.readerRender,
      failureStage: 'react_render',
      exceptionMessage: error.message,
      componentStack: info.componentStack,
      boundaryRetryCount: this.state.attempt,
    }));
    void reportNonFatal(error, {
      feature: diagnostic.screen === 'Reader' ? 'reader' : 'app_lifecycle',
      operationType: diagnostic.stage,
      errorCategory: 'app_render_failed',
      retryCount: diagnostic.screen === 'Reader' ? diagnostic.retryCount : this.state.attempt,
      technicalStatusCode: diagnostic.httpStatus ?? classified.httpStatus ?? undefined,
    });
  }

  render() {
    if (this.state.failed) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
          <Text>画面を開けませんでした。書庫や読書位置は削除せずに、再読み込みします。</Text>
          <Button title="再読み込み" onPress={() => this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }))} />
        </View>
      );
    }
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}
