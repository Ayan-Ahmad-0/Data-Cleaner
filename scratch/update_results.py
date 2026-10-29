path = 'frontend/src/pages/ResultsPage.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """      {/* Cloud & Database Connector Export Modal */}
      <ConnectorModal
        mode="export"
        jobId={jobId}
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />"""

replacement = """      {/* Cloud & Database Connector Export Modal */}
      <ConnectorModal
        mode="export"
        jobId={jobId}
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        defaultFilename={jobData?.job?.filename}
        defaultFormat={jobData?.job?.detected_format || defaultFormat}
      />"""

if target in content:
    content = content.replace(target, replacement, 1)
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    print("Successfully updated ResultsPage.tsx")
else:
    print("Target not found in content!")
