"""Twitter/X router for social network simulation."""
import csv
import io
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db_session
from app.models import TwitterAccount, TwitterPost, TwitterPostMedia, Exercise, Media, Team
from app.models.twitter import TwitterAccountType, TwitterPostType
from app.models.user import UserRole
from app.routers.auth import require_auth, require_role
from app.utils.tenancy import TenantRequestContext, require_tenant_context

router = APIRouter()


async def _ensure_exercise_in_tenant(
    db: AsyncSession,
    exercise_id: int,
    tenant_id: int,
) -> Exercise:
    result = await db.execute(
        select(Exercise).where(
            Exercise.id == exercise_id,
            Exercise.tenant_id == tenant_id,
        )
    )
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise


async def _get_account_in_tenant(
    db: AsyncSession,
    account_id: int,
    tenant_id: int,
) -> TwitterAccount:
    result = await db.execute(
        select(TwitterAccount)
        .join(Exercise, Exercise.id == TwitterAccount.exercise_id)
        .where(
            TwitterAccount.id == account_id,
            Exercise.tenant_id == tenant_id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


async def _get_post_in_tenant(
    db: AsyncSession,
    post_id: int,
    tenant_id: int,
    *,
    with_account: bool = False,
) -> TwitterPost:
    query = select(TwitterPost).join(TwitterAccount, TwitterAccount.id == TwitterPost.account_id).join(
        Exercise, Exercise.id == TwitterAccount.exercise_id
    )
    if with_account:
        query = query.options(selectinload(TwitterPost.account))
    result = await db.execute(
        query.where(
            TwitterPost.id == post_id,
            Exercise.tenant_id == tenant_id,
        )
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


# Schemas
class TwitterAccountBase(BaseModel):
    """Base Twitter account schema."""
    handle: str
    display_name: str
    account_type: TwitterAccountType
    verified: bool = False
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    controlled_by_team_id: Optional[int] = None


class TwitterAccountCreate(TwitterAccountBase):
    """Schema for creating a Twitter account."""
    exercise_id: int


class TwitterAccountUpdate(BaseModel):
    """Schema for updating a Twitter account."""
    display_name: Optional[str] = None
    account_type: Optional[TwitterAccountType] = None
    verified: Optional[bool] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    controlled_by_team_id: Optional[int] = None


class TwitterAccountResponse(TwitterAccountBase):
    """Schema for Twitter account response."""
    id: int
    exercise_id: int
    follower_count: int
    following_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TwitterPostBase(BaseModel):
    """Base Twitter post schema."""
    content: str
    post_type: TwitterPostType = TwitterPostType.TWEET


class TwitterPostCreate(TwitterPostBase):
    """Schema for creating a Twitter post."""
    account_id: int
    reply_to_id: Optional[int] = None
    quote_of_id: Optional[int] = None
    scheduled_at: Optional[datetime] = None
    media_ids: Optional[List[int]] = None


class TwitterPostUpdate(BaseModel):
    """Schema for updating a Twitter post."""
    content: Optional[str] = None
    scheduled_at: Optional[datetime] = None


class TwitterPostResponse(TwitterPostBase):
    """Schema for Twitter post response."""
    id: int
    account_id: int
    reply_to_id: Optional[int]
    quote_of_id: Optional[int]
    like_count: int
    retweet_count: int
    reply_count: int
    quote_count: int
    view_count: int
    scheduled_at: Optional[datetime]
    posted_at: Optional[datetime]
    created_at: datetime
    account: Optional[TwitterAccountResponse] = None

    model_config = {"from_attributes": True}


class TwitterAccountListResponse(BaseModel):
    """Schema for list of Twitter accounts."""
    accounts: list[TwitterAccountResponse]
    total: int


class TwitterPostListResponse(BaseModel):
    """Schema for list of Twitter posts."""
    posts: list[TwitterPostResponse]
    total: int


# === Twitter Accounts ===

@router.get("/accounts/{exercise_id}", response_model=TwitterAccountListResponse)
async def list_accounts(
    exercise_id: int,
    account_type: Optional[TwitterAccountType] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: any = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """List Twitter accounts for an exercise."""
    await _ensure_exercise_in_tenant(db, exercise_id, tenant_ctx.tenant.id)
    query = select(TwitterAccount).where(TwitterAccount.exercise_id == exercise_id)
    count_query = select(func.count(TwitterAccount.id)).where(TwitterAccount.exercise_id == exercise_id)
    
    if account_type:
        query = query.where(TwitterAccount.account_type == account_type)
        count_query = count_query.where(TwitterAccount.account_type == account_type)
    
    if search:
        query = query.where(TwitterAccount.display_name.ilike(f"%{search}%") | TwitterAccount.handle.ilike(f"%{search}%"))
        count_query = count_query.where(TwitterAccount.display_name.ilike(f"%{search}%") | TwitterAccount.handle.ilike(f"%{search}%"))
    
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    offset = (page - 1) * page_size
    query = query.order_by(TwitterAccount.created_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    accounts = result.scalars().all()
    
    return TwitterAccountListResponse(
        accounts=[TwitterAccountResponse.model_validate(a) for a in accounts],
        total=total,
    )


@router.post("/accounts", response_model=TwitterAccountResponse, status_code=201)
async def create_account(
    account_data: TwitterAccountCreate,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a Twitter account."""
    # Verify exercise exists
    await _ensure_exercise_in_tenant(db, account_data.exercise_id, tenant_ctx.tenant.id)
    if account_data.controlled_by_team_id is not None:
        team_result = await db.execute(
            select(Team.id).where(
                Team.id == account_data.controlled_by_team_id,
                Team.tenant_id == tenant_ctx.tenant.id,
            )
        )
        if team_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Team not found")
    
    # Check handle uniqueness within exercise
    existing = await db.execute(
        select(TwitterAccount).where(
            TwitterAccount.exercise_id == account_data.exercise_id,
            TwitterAccount.handle == account_data.handle
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Handle already exists in this exercise")
    
    account = TwitterAccount(
        exercise_id=account_data.exercise_id,
        handle=account_data.handle,
        display_name=account_data.display_name,
        account_type=account_data.account_type,
        verified=account_data.verified,
        bio=account_data.bio,
        avatar_url=account_data.avatar_url,
        controlled_by_team_id=account_data.controlled_by_team_id,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    
    return TwitterAccountResponse.model_validate(account)


@router.get("/accounts/by-id/{account_id}", response_model=TwitterAccountResponse)
async def get_account(
    account_id: int,
    _: any = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Get a Twitter account by ID."""
    account = await _get_account_in_tenant(db, account_id, tenant_ctx.tenant.id)
    return TwitterAccountResponse.model_validate(account)


@router.put("/accounts/{account_id}", response_model=TwitterAccountResponse)
async def update_account(
    account_id: int,
    account_data: TwitterAccountUpdate,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a Twitter account."""
    account = await _get_account_in_tenant(db, account_id, tenant_ctx.tenant.id)
    
    if account_data.display_name is not None:
        account.display_name = account_data.display_name
    if account_data.account_type is not None:
        account.account_type = account_data.account_type
    if account_data.verified is not None:
        account.verified = account_data.verified
    if account_data.bio is not None:
        account.bio = account_data.bio
    if account_data.avatar_url is not None:
        account.avatar_url = account_data.avatar_url
    if account_data.controlled_by_team_id is not None:
        team_result = await db.execute(
            select(Team.id).where(
                Team.id == account_data.controlled_by_team_id,
                Team.tenant_id == tenant_ctx.tenant.id,
            )
        )
        if team_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Team not found")
        account.controlled_by_team_id = account_data.controlled_by_team_id
    
    await db.commit()
    await db.refresh(account)
    
    return TwitterAccountResponse.model_validate(account)


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: int,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete a Twitter account."""
    account = await _get_account_in_tenant(db, account_id, tenant_ctx.tenant.id)
    await db.delete(account)
    await db.commit()
    
    return {"message": "Account deleted"}


# === Twitter Posts ===

@router.get("/posts/{exercise_id}", response_model=TwitterPostListResponse)
async def list_posts(
    exercise_id: int,
    account_id: Optional[int] = None,
    post_type: Optional[TwitterPostType] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: any = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """List Twitter posts for an exercise."""
    await _ensure_exercise_in_tenant(db, exercise_id, tenant_ctx.tenant.id)
    query = select(TwitterPost).join(TwitterAccount).where(TwitterAccount.exercise_id == exercise_id)
    count_query = select(func.count(TwitterPost.id)).join(TwitterAccount).where(TwitterAccount.exercise_id == exercise_id)
    
    if account_id:
        query = query.where(TwitterPost.account_id == account_id)
        count_query = count_query.where(TwitterPost.account_id == account_id)
    if post_type:
        query = query.where(TwitterPost.post_type == post_type)
        count_query = count_query.where(TwitterPost.post_type == post_type)
    
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    offset = (page - 1) * page_size
    query = query.options(selectinload(TwitterPost.account)).order_by(TwitterPost.created_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    posts = result.scalars().all()
    
    return TwitterPostListResponse(
        posts=[TwitterPostResponse.model_validate(p) for p in posts],
        total=total,
    )


@router.post("/posts", response_model=TwitterPostResponse, status_code=201)
async def create_post(
    post_data: TwitterPostCreate,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a Twitter post."""
    # Verify account exists
    account = await _get_account_in_tenant(db, post_data.account_id, tenant_ctx.tenant.id)
    if post_data.media_ids:
        media_result = await db.execute(
            select(Media.id).where(
                Media.id.in_(post_data.media_ids),
                Media.tenant_id == tenant_ctx.tenant.id,
            )
        )
        found_media_ids = {row[0] for row in media_result.fetchall()}
        missing_media = [mid for mid in post_data.media_ids if mid not in found_media_ids]
        if missing_media:
            raise HTTPException(status_code=404, detail=f"Media not found: {missing_media}")
    
    post = TwitterPost(
        account_id=post_data.account_id,
        exercise_id=account.exercise_id,
        content=post_data.content,
        post_type=post_data.post_type,
        reply_to_id=post_data.reply_to_id,
        quote_of_id=post_data.quote_of_id,
        scheduled_at=post_data.scheduled_at,
    )
    db.add(post)
    await db.flush()
    
    # Add media associations
    if post_data.media_ids:
        for idx, media_id in enumerate(post_data.media_ids):
            post_media = TwitterPostMedia(
                post_id=post.id,
                media_id=media_id,
                display_order=idx,
            )
            db.add(post_media)
    
    await db.commit()
    await db.refresh(post)
    
    # Load account for response
    await db.refresh(post, ["account"])
    
    return TwitterPostResponse.model_validate(post)


@router.get("/posts/by-id/{post_id}", response_model=TwitterPostResponse)
async def get_post(
    post_id: int,
    _: any = Depends(require_auth),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Get a Twitter post by ID."""
    post = await _get_post_in_tenant(db, post_id, tenant_ctx.tenant.id, with_account=True)
    return TwitterPostResponse.model_validate(post)


@router.put("/posts/{post_id}", response_model=TwitterPostResponse)
async def update_post(
    post_id: int,
    post_data: TwitterPostUpdate,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a Twitter post."""
    post = await _get_post_in_tenant(db, post_id, tenant_ctx.tenant.id)
    
    if post.posted_at:
        raise HTTPException(status_code=400, detail="Cannot update a posted tweet")
    
    if post_data.content is not None:
        post.content = post_data.content
    if post_data.scheduled_at is not None:
        post.scheduled_at = post_data.scheduled_at
    
    await db.commit()
    await db.refresh(post, ["account"])
    
    return TwitterPostResponse.model_validate(post)


@router.post("/posts/{post_id}/publish")
async def publish_post(
    post_id: int,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Publish a scheduled tweet immediately."""
    post = await _get_post_in_tenant(db, post_id, tenant_ctx.tenant.id)
    
    if post.posted_at:
        raise HTTPException(status_code=400, detail="Post already published")
    
    post.posted_at = datetime.now(timezone.utc)
    await db.commit()
    
    return {"message": "Post published", "posted_at": post.posted_at}


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete a Twitter post."""
    post = await _get_post_in_tenant(db, post_id, tenant_ctx.tenant.id)
    await db.delete(post)
    await db.commit()
    
    return {"message": "Post deleted"}


# === CSV Import ===

class CSVImportResult(BaseModel):
    """Result of CSV import."""
    success: int
    errors: list[dict]


@router.post("/accounts/import-csv", response_model=CSVImportResult, status_code=201)
async def import_accounts_csv(
    exercise_id: int = Query(..., description="Exercise ID"),
    file: UploadFile = File(...),
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Import Twitter accounts from CSV file.
    
    Expected CSV columns:
    - handle: @handle (required)
    - display_name: Account name (required)
    - account_type: journalist, official, influencer, citizen, fake_news, organization
    - verified: true/false
    - bio: Account bio
    - avatar_url: URL to avatar image
    - follower_count: Number of followers
    """
    # Verify exercise exists
    await _ensure_exercise_in_tenant(db, exercise_id, tenant_ctx.tenant.id)
    
    content = await file.read()
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        text = content.decode('latin-1')
    
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file is empty or has no headers")
    
    required = {'handle', 'display_name'}
    if not required.issubset(set(reader.fieldnames)):
        missing = required - set(reader.fieldnames)
        raise HTTPException(status_code=400, detail=f"Missing required columns: {missing}")
    
    created = 0
    errors = []
    row_num = 1
    
    for row in reader:
        row_num += 1
        try:
            handle = row['handle'].strip().lstrip('@')
            if not handle:
                errors.append({"row": row_num, "error": "Handle is required"})
                continue
            
            display_name = row['display_name'].strip()
            if not display_name:
                errors.append({"row": row_num, "error": "Display name is required"})
                continue
            
            account_type_str = row.get('account_type', 'anonymous').lower().strip()
            try:
                account_type = TwitterAccountType(account_type_str)
            except ValueError:
                account_type = TwitterAccountType.ANONYMOUS
            
            verified = row.get('verified', 'false').lower().strip() == 'true'
            bio = row.get('bio', '').strip() or None
            avatar_url = row.get('avatar_url', '').strip() or None
            follower_count = int(row.get('follower_count', 0) or 0)
            
            # Check for existing handle
            existing = await db.execute(
                select(TwitterAccount).where(
                    TwitterAccount.exercise_id == exercise_id,
                    TwitterAccount.handle == handle
                )
            )
            if existing.scalar_one_or_none():
                errors.append({"row": row_num, "error": f"Handle '@{handle}' already exists"})
                continue
            
            account = TwitterAccount(
                exercise_id=exercise_id,
                handle=handle,
                display_name=display_name,
                account_type=account_type,
                verified=verified,
                bio=bio,
                avatar_url=avatar_url,
                follower_count=follower_count,
            )
            db.add(account)
            created += 1
            
        except Exception as e:
            errors.append({"row": row_num, "error": str(e)})
    
    await db.commit()
    
    return CSVImportResult(success=created, errors=errors)


@router.post("/posts/import-csv", response_model=CSVImportResult, status_code=201)
async def import_posts_csv(
    exercise_id: int = Query(..., description="Exercise ID"),
    file: UploadFile = File(...),
    current_user = Depends(require_role(UserRole.ADMIN, UserRole.ANIMATEUR)),
    tenant_ctx: TenantRequestContext = Depends(require_tenant_context),
    db: AsyncSession = Depends(get_db_session),
):
    """Import Twitter posts from CSV file.
    
    Expected CSV columns:
    - account_handle: @handle of the account (required)
    - content: Tweet content (required)
    - post_type: tweet, reply, quote, retweet
    - scheduled_at: ISO datetime for scheduled posts
    - like_count: Initial like count
    - retweet_count: Initial retweet count
    """
    # Verify exercise exists
    await _ensure_exercise_in_tenant(db, exercise_id, tenant_ctx.tenant.id)
    
    # Get accounts by handle
    accounts_result = await db.execute(
        select(TwitterAccount).where(TwitterAccount.exercise_id == exercise_id)
    )
    accounts = {a.handle.lower().lstrip('@'): a for a in accounts_result.scalars().all()}
    
    content = await file.read()
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        text = content.decode('latin-1')
    
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file is empty or has no headers")
    
    required = {'account_handle', 'content'}
    if not required.issubset(set(reader.fieldnames)):
        missing = required - set(reader.fieldnames)
        raise HTTPException(status_code=400, detail=f"Missing required columns: {missing}")
    
    created = 0
    errors = []
    row_num = 1
    
    for row in reader:
        row_num += 1
        try:
            handle = row['account_handle'].strip().lstrip('@').lower()
            if handle not in accounts:
                errors.append({"row": row_num, "error": f"Account '@{handle}' not found"})
                continue
            
            content_text = row['content'].strip()
            if not content_text:
                errors.append({"row": row_num, "error": "Content is required"})
                continue
            
            post_type_str = row.get('post_type', 'tweet').lower().strip()
            try:
                post_type = TwitterPostType(post_type_str)
            except ValueError:
                post_type = TwitterPostType.TWEET
            
            scheduled_at = None
            scheduled_at_str = row.get('scheduled_at', '').strip()
            if scheduled_at_str:
                try:
                    scheduled_at = datetime.fromisoformat(scheduled_at_str.replace('Z', '+00:00'))
                except ValueError:
                    pass
            
            like_count = int(row.get('like_count', 0) or 0)
            retweet_count = int(row.get('retweet_count', 0) or 0)
            
            post = TwitterPost(
                account_id=accounts[handle].id,
                exercise_id=exercise_id,
                content=content_text,
                post_type=post_type,
                scheduled_at=scheduled_at,
                like_count=like_count,
                retweet_count=retweet_count,
            )
            db.add(post)
            created += 1
            
        except Exception as e:
            errors.append({"row": row_num, "error": str(e)})
    
    await db.commit()
    
    return CSVImportResult(success=created, errors=errors)


@router.get("/template/accounts/csv")
async def download_accounts_template():
    """Download CSV template for Twitter accounts."""
    template = """handle,display_name,account_type,verified,bio,avatar_url,follower_count
@news24,News 24,journalist,true,"Breaking news from around the world",https://example.com/avatar1.png,150000
@officialgov,Government Official,official,true,"Official government account",https://example.com/avatar2.png,500000
@techguru,Tech Guru,influencer,false,"Tech reviews and insights",https://example.com/avatar3.png,75000
"""
    from fastapi.responses import Response
    return Response(
        content=template,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=twitter_accounts_template.csv"},
    )


@router.get("/template/posts/csv")
async def download_posts_template():
    """Download CSV template for Twitter posts."""
    template = """account_handle,content,post_type,scheduled_at,like_count,retweet_count
@news24,"Breaking: Major incident reported in downtown area. More details to follow.",tweet,2026-03-12T09:00:00,150,45
@officialgov,"We are aware of the situation and coordinating with local authorities.",tweet,2026-03-12T09:30:00,89,23
@techguru,"This looks like a major cyber incident. Monitoring closely...",tweet,2026-03-12T10:00:00,234,89
"""
    from fastapi.responses import Response
    return Response(
        content=template,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=twitter_posts_template.csv"},
    )
