import { HUB_URL } from "../consts";
import { createApiError, InvalidApiResponseFormatError } from "../error";
import type { Credentials, RepoDesignation } from "../types/public";
import { checkCredentials } from "../utils/checkCredentials";
import { toRepoId } from "../utils/toRepoId";

export interface FileDownloadInfoOutput {
	size: number;
	etag: string;
	/**
	 * In case of LFS file, link to download directly from cloud provider
	 */
	downloadLink: string | null;
}
/**
 * @returns null when the file doesn't exist
 */
export async function fileDownloadInfo(params: {
	repo: RepoDesignation;
	path: string;
	revision?: string;
	credentials?: Credentials;
	hubUrl?: string;
	/**
	 * Custom fetch function to use instead of the default one, for example to use a proxy or edit headers.
	 */
	fetch?: typeof fetch;
	/**
	 * To get the raw pointer file behind a LFS file
	 */
	raw?: boolean;
	/**
	 * To avoid the content-disposition header in the `downloadLink` for LFS files
	 *
	 * So that on browsers you can use the URL in an iframe for example
	 */
	noContentDisposition?: boolean;
}): Promise<FileDownloadInfoOutput | null> {
	checkCredentials(params.credentials);
	const repoId = toRepoId(params.repo);

	const hubUrl = params.hubUrl ?? HUB_URL;
	const url =
		`${hubUrl}/${repoId.type === "model" ? "" : `${repoId.type}s/`}${repoId.name}/${
			params.raw ? "raw" : "resolve"
		}/${encodeURIComponent(params.revision ?? "main")}/${params.path}` +
		(params.noContentDisposition ? "?noContentDisposition=1" : "");

	const resp = await (params.fetch ?? fetch)(url, {
		method: "HEAD",
		headers: params.credentials
			? {
					Authorization: `Bearer ${params.credentials.accessToken}`,
			  }
			: {},
	});

	if (resp.status === 404 && resp.headers.get("X-Error-Code") === "EntryNotFound") {
		return null;
	}

	if (!resp.ok) {
		throw await createApiError(resp);
	}

	const etag = resp.headers.get("ETag");

	if (!etag) {
		throw new InvalidApiResponseFormatError("Expected ETag");
	}

	const sizeHeader = resp.headers.get("Content-Length");

	if (!sizeHeader) {
		throw new InvalidApiResponseFormatError("Expected size information");
	}

	const size = parseInt(sizeHeader);

	if (isNaN(size)) {
		throw new InvalidApiResponseFormatError("Invalid file size received");
	}

	return {
		etag,
		size,
		downloadLink: new URL(resp.url).hostname !== new URL(hubUrl).hostname ? resp.url : null,
	};
}
