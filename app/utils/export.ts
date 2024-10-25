import { webcontainer, webcontainerContext } from '~/lib/webcontainer';
import JSZip from 'jszip';
import { createScopedLogger } from './logger';
import { WORK_DIR } from './constants';

const logger = createScopedLogger('Export');

export async function exportFiles() {
  if (!webcontainerContext.loaded) {
    throw new Error('WebContainer is not ready');
  }

  try {
    logger.info('Starting file export...');
    const container = await webcontainer;
    const zip = new JSZip();
    
    // Helper function to recursively add files to zip
    async function addFilesToZip(currentPath: string) {
      logger.info(`Reading directory: ${currentPath}`);
      try {
        // Use relative path for fs operations
        const relativePath = currentPath.replace(container.workdir, '').replace(/^\//, '');
        const entries = await container.fs.readdir(relativePath, { withFileTypes: true });
        
        for (const entry of entries) {
          const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          
          // Skip node_modules and .git directories
          if (entry.isDirectory() && (entry.name === 'node_modules' || entry.name === '.git')) {
            logger.info(`Skipping directory: ${entry.name}`);
            continue;
          }
          
          if (entry.isDirectory()) {
            logger.info(`Creating folder in zip: ${entryRelativePath}`);
            zip.folder(entryRelativePath);
            await addFilesToZip(`${currentPath}/${entry.name}`);
          } else {
            try {
              const content = await container.fs.readFile(entryRelativePath);
              logger.info(`Adding file to zip: ${entryRelativePath}`);
              zip.file(entryRelativePath, content);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              logger.error(`Failed to read file ${entryRelativePath}:`, errorMessage);
              // Continue with other files even if one fails
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to read directory ${currentPath}:`, errorMessage);
        throw new Error(`Failed to read directory: ${errorMessage}`);
      }
    }

    // Start from the project root
    await addFilesToZip(container.workdir);
    
    logger.info('Generating zip file...');
    const zipContent = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });
    
    if (!zipContent || zipContent.size === 0) {
      throw new Error('Generated zip file is empty');
    }

    logger.info(`Zip file generated (${zipContent.size} bytes)`);
    logger.info('Creating download link...');

    const url = URL.createObjectURL(zipContent);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.zip';
    
    // Use a more reliable way to trigger download
    const clickHandler = () => {
      setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
    };
    
    a.addEventListener('click', clickHandler, { once: true });
    document.body.appendChild(a);
    a.click();
    
    logger.info('Export complete!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Export failed:', errorMessage);
    throw new Error(`Export failed: ${errorMessage}`);
  }
}
