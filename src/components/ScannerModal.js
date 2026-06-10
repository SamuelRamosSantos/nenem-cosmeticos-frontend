import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT, RADIUS } from '../theme';

const BARCODE_TYPES = [
  'qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e',
];

// =============================================================================
// ScannerModal — leitor de código de barras
//
// Causa da tela preta no Android:
//   CameraView usa um SurfaceTexture nativo que precisa que o layout do
//   container já tenha sido calculado E que a animação do Modal tenha
//   terminado antes de montar. Se montar antes, trava em preto.
//
// Solução:
//   1. cameraAtiva começa false.
//   2. Modal.onShow dispara quando a animação termina → cameraAtiva = true.
//   3. CameraView só monta quando cameraAtiva && isFocused.
//   4. CameraView usa style={{ flex:1 }} — NÃO absoluteFillObject.
//      O absoluteFillObject depende de um parent já dimensionado; flex:1 não.
//   5. O overlay fica com absoluteFillObject sobre a câmera.
// =============================================================================
export default function ScannerModal({ visible, onScan, onClose }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned,    setScanned]        = useState(false);
  const [cameraAtiva, setCameraAtiva]   = useState(false);
  const isFocused = useIsFocused();

  // Reseta o estado da câmera ao fechar o modal
  useEffect(() => {
    if (!visible) {
      setCameraAtiva(false);
      setScanned(false);
    }
  }, [visible]);

  const handleBarcode = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    onScan(data);
    setTimeout(() => setScanned(false), 1500);
  };

  if (!visible) return null;

  if (!permission) {
    return (
      <Modal visible animationType="slide" statusBarTranslucent>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color={COLORS.textLight} />
          <Text style={styles.permissionText}>Verificando permissões...</Text>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible animationType="slide" statusBarTranslucent>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-off-outline" size={64} color={COLORS.textLight} />
          <Text style={styles.permissionTitle}>Câmera necessária</Text>
          <Text style={styles.permissionText}>
            Permita o acesso à câmera para usar o leitor de código de barras.
          </Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Ionicons name="camera-outline" size={18} color="#fff" />
            <Text style={styles.permissionBtnText}>Permitir Câmera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible
      animationType="slide"
      statusBarTranslucent
      onShow={() => setCameraAtiva(true)}
      onRequestClose={onClose}
    >
      <View style={styles.container}>

        {/* ── CÂMERA ────────────────────────────────────────────────────
            Monta SOMENTE após onShow (animação completa) e com foco.
            Usa flex:1 — não absoluteFillObject — para ocupar o container
            antes de o layout nativo ser calculado.                     */}
        {cameraAtiva && isFocused ? (
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={handleBarcode}
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          />
        ) : (
          /* Placeholder preto enquanto a câmera não inicializa */
          <View style={styles.cameraPlaceholder}>
            <ActivityIndicator color={COLORS.accent} size="large" />
            <Text style={styles.loadingText}>Iniciando câmera...</Text>
          </View>
        )}

        {/* ── OVERLAY ───────────────────────────────────────────────────
            absoluteFillObject sobre a câmera (que já tem flex:1).      */}
        <View style={styles.overlay}>
          <View style={styles.overlayTop} />
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.frame}>
              {[
                { top: 0,    left: 0,    borderTopWidth: 3, borderLeftWidth: 3    },
                { top: 0,    right: 0,   borderTopWidth: 3, borderRightWidth: 3   },
                { bottom: 0, left: 0,    borderBottomWidth: 3, borderLeftWidth: 3 },
                { bottom: 0, right: 0,   borderBottomWidth: 3, borderRightWidth: 3 },
              ].map((cs, i) => <View key={i} style={[styles.corner, cs]} />)}
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom}>
            <Text style={styles.scanHint}>
              {scanned ? '✓ Código lido!' : 'Aponte a câmera para o código de barras'}
            </Text>
          </View>
        </View>

        {/* ── BOTÃO FECHAR ──────────────────────────────────────────── */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close-circle" size={48} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>

      </View>
    </Modal>
  );
}

const FRAME_SIZE = 260;

const styles = StyleSheet.create({
  // Container ocupa tela inteira
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // CameraView em fluxo normal com flex:1 (NÃO absoluteFillObject)
  camera: {
    flex: 1,
  },

  // Placeholder exibido enquanto a câmera não inicializa
  cameraPlaceholder: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: FONT.sm,
  },

  // Overlay absolutamente posicionado SOBRE a câmera
  overlay:       { ...StyleSheet.absoluteFillObject, flexDirection: 'column' },
  overlayTop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayMiddle: { flexDirection: 'row', height: FRAME_SIZE },
  overlaySide:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  frame: {
    width: FRAME_SIZE, height: FRAME_SIZE,
    borderRadius: RADIUS.md, overflow: 'hidden',
  },
  corner: {
    position: 'absolute', width: 28, height: 28,
    borderColor: COLORS.accent,
  },
  overlayBottom: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', paddingTop: SPACING.lg,
  },
  scanHint: {
    color: '#fff', fontSize: FONT.md, fontWeight: '600',
    textAlign: 'center', paddingHorizontal: SPACING.lg,
  },

  // Botão fechar
  closeBtn: {
    position: 'absolute', bottom: 48, alignSelf: 'center',
  },

  // Permissão
  permissionContainer: {
    flex: 1, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, gap: SPACING.md,
  },
  permissionTitle: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.text },
  permissionText:  { fontSize: FONT.sm, color: COLORS.textSecondary, textAlign: 'center' },
  permissionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm + 2,
  },
  permissionBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '700' },
  cancelBtn:     { padding: SPACING.sm },
  cancelBtnText: { color: COLORS.error, fontSize: FONT.md },
});
